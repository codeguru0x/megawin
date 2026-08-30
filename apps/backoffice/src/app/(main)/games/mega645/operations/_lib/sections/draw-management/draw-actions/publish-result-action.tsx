"use client";

import { useEffect, useRef, useState } from "react";

import Link from "next/link";

import { GameProduct } from "@megawin/game-core/entities";
import { VietlottSuggestionUnavailableReason } from "@megawin/game-core/utils";
import { MEGA645_NUMBER_COUNT, MEGA645_NUMBER_MAX, MEGA645_NUMBER_MIN } from "@megawin/game-mega645/entities";
import { displayVNDate } from "@megawin/shared/utils";
import {
  AlertCircle,
  AlertTriangle,
  CalendarDays,
  Check,
  ClipboardCheck,
  Dice5,
  ExternalLink,
  Hash,
  Loader2,
} from "lucide-react";

import { formatResultDialogTitle } from "@/app/(main)/games/_lib/operations/result-dialog-title";
import { vietlottConfigHref } from "@/app/(main)/games/_lib/operations/vietlott-config-link";
import { VietlottReminderNote } from "@/app/(main)/games/_lib/operations/vietlott-reminder-note";
import { VIETLOTT_SUGGESTION_UNAVAILABLE_MESSAGES } from "@/app/(main)/games/_lib/operations/vietlott-suggestion-messages";
import { generateUniqueRandomNumbers, RandomFillButton } from "@/components/draws";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

import type { DrawSelectorItem } from "../../../use-operations";
import { usePublishResult, useVietlottSuggestion } from "../../../use-operations";

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Href tĩnh — build 1 lần ở module scope, dùng lại cho cả 2 nhắc nhở trong dialog. */
const vietlottConfigLink = vietlottConfigHref(GameProduct.Mega645);

// ─── Types ──────────────────────────────────────────────────────────

export interface PublishResultCurrentValues {
  winningNumbers: string[];
  vietlottRef?: { drawPeriod: string; drawDate: string };
}

interface ValidationResult {
  messages: string[];
  fieldErrors: Set<number>;
}

const VALID: ValidationResult = { messages: [], fieldErrors: new Set() };

// ─── Validate ───────────────────────────────────────────────────────

function validateMega645Numbers(numbers: string[]): ValidationResult {
  const messages: string[] = [];
  const fieldErrors = new Set<number>();
  const parsed: (number | null)[] = [];
  const emptyIndices: number[] = [];

  for (let i = 0; i < numbers.length; i++) {
    const v = numbers[i]?.trim() ?? "";
    if (!v) {
      emptyIndices.push(i);
      fieldErrors.add(i);
      parsed.push(null);
      continue;
    }
    if (v.length !== 2) {
      messages.push(`Ô ${i + 1}: phải nhập đủ 2 chữ số (VD: ${pad2(MEGA645_NUMBER_MIN)})`);
      fieldErrors.add(i);
      parsed.push(null);
      continue;
    }
    const n = parseInt(v, 10);
    if (isNaN(n) || n < MEGA645_NUMBER_MIN || n > MEGA645_NUMBER_MAX) {
      messages.push(`Ô ${i + 1}: số ${v} ngoài dải ${pad2(MEGA645_NUMBER_MIN)}–${pad2(MEGA645_NUMBER_MAX)}`);
      fieldErrors.add(i);
      parsed.push(null);
    } else {
      parsed.push(n);
    }
  }

  if (emptyIndices.length > 0) {
    messages.push(`Còn ${emptyIndices.length} ô chưa nhập (ô ${emptyIndices.map((i) => i + 1).join(", ")})`);
  }

  const posMap = new Map<number, number[]>();
  for (let i = 0; i < parsed.length; i++) {
    const n = parsed[i];
    if (n == null) continue;
    const arr = posMap.get(n);
    if (arr) arr.push(i);
    else posMap.set(n, [i]);
  }
  for (const [value, positions] of posMap) {
    if (positions.length > 1) {
      messages.push(`Số ${pad2(value)} bị trùng (ô ${positions.map((i) => i + 1).join(", ")})`);
      for (const idx of positions) fieldErrors.add(idx);
    }
  }

  return messages.length > 0 ? { messages, fieldErrors } : VALID;
}

// ─── Component ──────────────────────────────────────────────────────

export function PublishResultAction({
  draw,
  disabled,
  open,
  onOpenChange,
  currentResult,
}: {
  draw: DrawSelectorItem;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  currentResult?: PublishResultCurrentValues;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open !== undefined ? open : internalOpen;
  const setIsOpen = onOpenChange ?? setInternalOpen;
  const publishResult = usePublishResult();
  const isRepublish = draw.status === "published" || draw.status === "settled";

  // Ngày Vietlott mặc định PHẢI là ngày quay của CHÍNH kỳ này (`draw.scheduledDrawAt`,
  // giờ VN) — KHÔNG phải ngày hôm nay lúc thao tác. Staff hoàn toàn có thể nhập/sửa kết
  // quả một kỳ của NGÀY HÔM QUA (vào sáng sớm hôm sau) → `todayVN()` sẽ prefill sai ngày,
  // dễ tạo `vietlottRef.drawDate` lệch 1 ngày mà không ai để ý (đã xảy ra thực tế — P0.1).
  const defaultVietlotDate = displayVNDate(draw.scheduledDrawAt);

  const [numbers, setNumbers] = useState<string[]>(Array(MEGA645_NUMBER_COUNT).fill(""));
  const [vietlotDate, setVietlotDate] = useState(defaultVietlotDate);
  const [vietlotPeriod, setVietlotPeriod] = useState("");
  const [periodTouched, setPeriodTouched] = useState(false);
  const [validation, setValidation] = useState<ValidationResult>(VALID);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Gợi ý mã kỳ Vietlott — chỉ fetch khi dialog mở (P4). Đọc neo + lịch từ config
  // DB phía server, không tính gì ở client.
  const suggestion = useVietlottSuggestion(draw.drawId, isOpen);
  const suggestedPeriod = suggestion.data?.suggestedPeriod ?? null;

  useEffect(() => {
    if (isOpen && currentResult) {
      setNumbers(
        currentResult.winningNumbers.length === MEGA645_NUMBER_COUNT
          ? currentResult.winningNumbers.map((n) => n.padStart(2, "0"))
          : Array(MEGA645_NUMBER_COUNT).fill(""),
      );
      setVietlotDate(currentResult.vietlottRef?.drawDate ?? defaultVietlotDate);
      setVietlotPeriod(currentResult.vietlottRef?.drawPeriod ?? "");
      setPeriodTouched(!!currentResult.vietlottRef?.drawPeriod);
    } else if (!isOpen) {
      setNumbers(Array(MEGA645_NUMBER_COUNT).fill(""));
      setVietlotDate(defaultVietlotDate);
      setVietlotPeriod("");
      setPeriodTouched(false);
      setValidation(VALID);
    }
  }, [isOpen, currentResult, defaultVietlotDate]);

  // Prefill mã kỳ từ gợi ý — CHỈ khi kỳ chưa có ref đã publish trước đó (`currentResult`) và
  // staff chưa tự gõ gì vào ô. Suy được sau khi dialog mở (round-trip async) nên tách effect
  // riêng, không gộp vào effect reset ở trên (chạy đồng bộ lúc mở dialog, trước khi có data).
  useEffect(() => {
    if (isOpen && !periodTouched && suggestedPeriod) {
      setVietlotPeriod(suggestedPeriod);
    }
  }, [isOpen, periodTouched, suggestedPeriod]);

  // Cảnh báo lệch — hiện ở MỌI kỳ (overview §4.3/§7): staff nhập khác gợi ý là detector
  // duy nhất phát hiện neo đã cũ. Cảnh báo MỀM, không chặn submit.
  const trimmedPeriod = vietlotPeriod.trim();
  const periodMismatch = !!suggestedPeriod && !!trimmedPeriod && trimmedPeriod !== suggestedPeriod;

  function handleNumberChange(index: number, raw: string) {
    const cleaned = raw.replace(/\D/g, "").slice(0, 2);
    setNumbers((prev) => {
      const next = [...prev];
      next[index] = cleaned;
      return next;
    });
  }

  function fillRandom() {
    const drawn = generateUniqueRandomNumbers(MEGA645_NUMBER_COUNT, MEGA645_NUMBER_MIN, MEGA645_NUMBER_MAX);
    setNumbers(drawn.map((n) => pad2(n)));
    setValidation(VALID);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = validateMega645Numbers(numbers);
    setValidation(result);
    if (result.messages.length > 0) {
      const firstIdx = [...result.fieldErrors][0];
      if (firstIdx !== undefined) inputRefs.current[firstIdx]?.focus();
      return;
    }

    const body: {
      winningNumbers: string[];
      vietlottRef?: { drawPeriod: string; drawDate: string };
    } = { winningNumbers: numbers.map((n) => n.padStart(2, "0")) };

    if (vietlotPeriod.trim()) {
      body.vietlottRef = { drawPeriod: vietlotPeriod.trim(), drawDate: vietlotDate };
    }

    publishResult.mutate({ drawId: draw.drawId, body }, { onSuccess: () => setIsOpen(false) });
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="size-4.5 text-teal-500" />
            {formatResultDialogTitle(draw.drawId, draw.drawTime)}
          </DialogTitle>
          <DialogDescription>
            Nhập {MEGA645_NUMBER_COUNT} số chính ({pad2(MEGA645_NUMBER_MIN)}–{pad2(MEGA645_NUMBER_MAX)}).
            {isRepublish && " Kết quả cũ sẽ bị ghi đè. Chỉ có hiệu lực trước khi kết sổ."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-6 py-2">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex size-6 items-center justify-center rounded-md bg-teal-100 dark:bg-teal-900/50">
                  <Dice5 className="size-3.5 text-teal-600 dark:text-teal-400" />
                </div>
                <Label className="text-sm font-semibold">Kết quả quay số</Label>
                <RandomFillButton onFill={fillRandom} />
              </div>

              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="mb-3 text-xs text-muted-foreground">
                  {MEGA645_NUMBER_COUNT} số chính (không trùng, {pad2(MEGA645_NUMBER_MIN)}–{pad2(MEGA645_NUMBER_MAX)})
                </p>
                <div className="grid grid-cols-6 gap-2">
                  {Array.from({ length: MEGA645_NUMBER_COUNT }, (_, i) => (
                    <div key={i} className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground text-center">{i + 1}</span>
                      <Input
                        ref={(el) => {
                          inputRefs.current[i] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        maxLength={2}
                        value={numbers[i]}
                        onChange={(e) => handleNumberChange(i, e.target.value)}
                        className={`w-full text-center font-mono text-sm font-semibold tabular-nums ${validation.fieldErrors.has(i) ? "border-destructive" : ""}`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {validation.messages.length > 0 && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 space-y-1">
                  {validation.messages.map((msg, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <AlertCircle className="size-3.5 text-destructive shrink-0 mt-0.5" />
                      <p className="text-sm text-destructive">{msg}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex size-6 items-center justify-center rounded-md bg-blue-100 dark:bg-blue-900/50">
                  <ExternalLink className="size-3.5 text-blue-600 dark:text-blue-400" />
                </div>
                <Label className="text-sm font-semibold">Tham chiếu Vietlott</Label>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="mb-3 text-xs text-muted-foreground">
                  Liên kết kỳ quay với dữ liệu Vietlott chính thức để đối soát
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <CalendarDays className="size-3" /> Ngày Vietlott
                    </Label>
                    <Input
                      type="date"
                      className="font-mono text-sm"
                      value={vietlotDate}
                      onChange={(e) => setVietlotDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Hash className="size-3" /> Mã kỳ Vietlott
                    </Label>
                    <Input
                      type="text"
                      placeholder="VD: 00123"
                      className="font-mono text-sm"
                      value={vietlotPeriod}
                      onChange={(e) => {
                        setPeriodTouched(true);
                        setVietlotPeriod(e.target.value);
                      }}
                    />
                  </div>
                </div>

                {/* 4 trường hợp không suy được — mỗi trường hợp 1 thông báo riêng (overview §7.1). */}
                {!suggestion.isFetching && !suggestedPeriod && !trimmedPeriod && suggestion.data?.reason && (
                  <div className="mt-3 rounded-lg border border-blue-300/50 bg-blue-50 px-4 py-3 dark:bg-blue-900/20">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="size-3.5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-sm leading-relaxed text-blue-800 dark:text-blue-300">
                          {VIETLOTT_SUGGESTION_UNAVAILABLE_MESSAGES[suggestion.data.reason]}
                        </p>
                        {suggestion.data.reason === VietlottSuggestionUnavailableReason.NoAnchor && (
                          <Link
                            href={vietlottConfigLink}
                            className="text-xs font-medium text-blue-700 underline dark:text-blue-400"
                          >
                            Cấu hình mã kỳ Vietlott →
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Cảnh báo lệch — MỌI kỳ, không chỉ kỳ đầu (overview §4.3). Mềm, không chặn lưu. */}
                {periodMismatch && (
                  <div className="mt-3 rounded-lg border border-amber-300/50 bg-amber-50 px-4 py-3 dark:bg-amber-900/20">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-sm text-amber-800 dark:text-amber-300">
                          Mã kỳ vừa nhập (<span className="font-mono font-semibold">{trimmedPeriod}</span>) khác gợi ý
                          hệ thống (<span className="font-mono font-semibold">{suggestedPeriod}</span>).
                        </p>
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          Nếu giá trị vừa nhập đúng với trang Vietlott, hãy{" "}
                          <Link href={vietlottConfigLink} className="font-medium underline">
                            cập nhật lại mã kỳ Vietlott
                          </Link>{" "}
                          ở cấu hình game để các kỳ sau tự tính đúng.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <VietlottReminderNote />
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
              Huỷ bỏ
            </Button>
            <Button type="submit" disabled={publishResult.isPending || disabled}>
              {publishResult.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Check className="mr-2 size-4" />
              )}
              Xác nhận
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
