"use client";

import { useEffect, useRef, useState } from "react";

import Link from "next/link";

import {
  BINGO18_BIG_MIN,
  BINGO18_DICE_MAX,
  BINGO18_DICE_MIN,
  BINGO18_DRAW_COUNT,
  BINGO18_SMALL_MAX,
} from "@megawin/game-bingo18/entities";
import { GameProduct } from "@megawin/game-core/entities";
import { VietlottSuggestionUnavailableReason } from "@megawin/game-core/utils";
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
import { generateRandomNumber, RandomFillButton } from "@/components/draws";
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

/** Href tĩnh — build 1 lần ở module scope, dùng lại cho cả 2 nhắc nhở trong dialog. */
const vietlottConfigLink = vietlottConfigHref(GameProduct.Bingo18);

// ─── Types ──────────────────────────────────────────────────────────

export interface PublishResultCurrentValues {
  diceNumbers: [number, number, number];
  vietlottRef?: { drawPeriod: string; drawDate: string };
}

interface ValidationResult {
  messages: string[];
  fieldErrors: Set<number>;
}

const VALID: ValidationResult = { messages: [], fieldErrors: new Set() };

// ─── Dán nhanh (paste) — bóc số từ text copy nguyên khối (VD từ trang Vietlott) ─

/** Bóc mọi chữ số đơn 1-6 trong text dán vào (VD "2 4 6" hoặc "2,4,6"). */
function extractPastedDice(raw: string): string[] {
  return raw.match(/[1-6]/g) ?? [];
}

// ─── Validate — 1 hàm duy nhất, trả messages + fieldErrors ─────────

function validateDice(dice: string[]): ValidationResult {
  const messages: string[] = [];
  const fieldErrors = new Set<number>();
  const emptyIndices: number[] = [];

  for (let i = 0; i < BINGO18_DRAW_COUNT; i++) {
    const v = dice[i]?.trim() ?? "";
    if (!v) {
      emptyIndices.push(i);
      fieldErrors.add(i);
      continue;
    }
    const n = parseInt(v, 10);
    if (Number.isNaN(n) || n < BINGO18_DICE_MIN || n > BINGO18_DICE_MAX) {
      messages.push(`Xúc xắc ${i + 1}: giá trị ${v} ngoài dải ${BINGO18_DICE_MIN}–${BINGO18_DICE_MAX}`);
      fieldErrors.add(i);
    }
  }

  if (emptyIndices.length > 0) {
    messages.push(`Chưa nhập xúc xắc ${emptyIndices.map((i) => i + 1).join(", ")}`);
  }

  return messages.length > 0 ? { messages, fieldErrors } : VALID;
}

/** Phân loại Lớn/Hòa/Nhỏ theo tổng 3 xúc xắc — dùng chung ranh giới `BINGO18_SMALL_MAX`/`BINGO18_BIG_MIN`. */
function classifySum(sum: number): "Nhỏ" | "Hoà" | "Lớn" {
  if (sum <= BINGO18_SMALL_MAX) {
    return "Nhỏ";
  }

  if (sum >= BINGO18_BIG_MIN) {
    return "Lớn";
  }

  return "Hoà";
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

  // Ngày Vietlott mặc định PHẢI là ngày quay của CHÍNH kỳ này (`draw.scheduledDrawAt`,
  // giờ VN) — KHÔNG phải ngày hôm nay lúc thao tác. Staff hoàn toàn có thể nhập/sửa kết
  // quả một kỳ của NGÀY HÔM QUA (vào sáng sớm hôm sau) → `todayVN()` sẽ prefill sai ngày,
  // dễ tạo `vietlottRef.drawDate` lệch 1 ngày mà không ai để ý (đã xảy ra thực tế).
  const defaultVietlotDate = displayVNDate(draw.scheduledDrawAt);

  const [dice, setDice] = useState<string[]>(Array(BINGO18_DRAW_COUNT).fill(""));
  const [vietlotDate, setVietlotDate] = useState(defaultVietlotDate);
  const [vietlotPeriod, setVietlotPeriod] = useState("");
  const [periodTouched, setPeriodTouched] = useState(false);
  const [validation, setValidation] = useState<ValidationResult>(VALID);
  const [pasteNotice, setPasteNotice] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Gợi ý mã kỳ Vietlott — chỉ fetch khi dialog mở (P2 mirror P0.5). Đọc neo + lịch từ
  // config DB phía server, không tính gì ở client.
  const suggestion = useVietlottSuggestion(draw.drawId, isOpen);
  const suggestedPeriod = suggestion.data?.suggestedPeriod ?? null;

  useEffect(() => {
    if (isOpen && currentResult?.diceNumbers?.length === BINGO18_DRAW_COUNT) {
      setDice(currentResult.diceNumbers.map((n) => String(n)));
      setVietlotDate(currentResult.vietlottRef?.drawDate ?? defaultVietlotDate);
      setVietlotPeriod(currentResult.vietlottRef?.drawPeriod ?? "");
      setPeriodTouched(!!currentResult.vietlottRef?.drawPeriod);
    } else if (!isOpen) {
      setDice(Array(BINGO18_DRAW_COUNT).fill(""));
      setVietlotDate(defaultVietlotDate);
      setVietlotPeriod("");
      setPeriodTouched(false);
      setValidation(VALID);
      setPasteNotice(null);
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

  function handleDiceChange(index: number, raw: string) {
    const cleaned = raw.replace(/\D/g, "").slice(0, 1);
    setDice((prev) => {
      const next = [...prev];
      next[index] = cleaned;
      return next;
    });
  }

  /**
   * Dán nguyên khối text copy từ nơi khác (VD trang kết quả Vietlott, "2 4 6") vào ô bất kỳ
   * trong 3 ô xúc xắc → tự bóc số và điền vào đúng vị trí, không cần chọn tay từng ô.
   *
   * - Dán đủ đúng 3 số → điền lại toàn bộ từ ô 1, chạy validate ngay.
   * - Dán thiếu (VD dán từng số lẻ) → điền tiếp từ ô đang focus.
   * - Số lượng không khớp (thường do lỡ copy kèm ngày/mã kỳ) → KHÔNG tự điền, báo rõ số
   *   lượng bóc được để tránh điền sai âm thầm (đường tiền không cho phép đoán).
   */
  function handleGridPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const tokens = extractPastedDice(e.clipboardData.getData("text"));
    if (tokens.length < 2) {
      return;
    }
    e.preventDefault();

    if (tokens.length === BINGO18_DRAW_COUNT) {
      setDice(tokens);
      setValidation(validateDice(tokens));
      setPasteNotice(null);
      requestAnimationFrame(() => inputRefs.current[BINGO18_DRAW_COUNT - 1]?.focus());
      return;
    }

    const targetIndex = inputRefs.current.indexOf(e.target as HTMLInputElement);
    const startIndex = targetIndex >= 0 ? targetIndex : 0;

    if (startIndex + tokens.length > BINGO18_DRAW_COUNT) {
      setPasteNotice(
        `Dán được ${tokens.length} số, không khớp đủ ${BINGO18_DRAW_COUNT} ô còn lại. Có thể đã copy kèm ngày/mã kỳ — chỉ copy đúng phần 3 số kết quả rồi dán lại.`,
      );
      return;
    }

    setPasteNotice(null);
    setDice((prev) => {
      const next = [...prev];
      tokens.forEach((t, i) => {
        next[startIndex + i] = t;
      });
      return next;
    });
    const lastFilled = startIndex + tokens.length - 1;
    requestAnimationFrame(() => inputRefs.current[Math.min(lastFilled + 1, BINGO18_DRAW_COUNT - 1)]?.focus());
  }

  function fillRandom() {
    const nums = Array.from({ length: BINGO18_DRAW_COUNT }, () =>
      String(generateRandomNumber(BINGO18_DICE_MIN, BINGO18_DICE_MAX)),
    );
    setDice(nums);
    setValidation(VALID);
  }

  const allSelected = dice.every((d) => d.trim() !== "");
  const sum = allSelected ? dice.reduce<number>((s, d) => s + parseInt(d, 10), 0) : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = validateDice(dice);
    setValidation(result);
    if (result.messages.length > 0) {
      const firstErrorIdx = [...result.fieldErrors][0];
      if (firstErrorIdx !== undefined) {
        inputRefs.current[firstErrorIdx]?.focus();
      }
      return;
    }

    const numbers = dice.map((d) => parseInt(d, 10));

    const body: {
      numbers: number[];
      vietlottRef?: { drawPeriod: string; drawDate: string };
    } = { numbers };

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
            <ClipboardCheck className="size-4.5 text-amber-500" />
            {formatResultDialogTitle(draw.drawId, draw.drawTime)}
          </DialogTitle>
          <DialogDescription>
            Nhập {BINGO18_DRAW_COUNT} số xúc xắc ({BINGO18_DICE_MIN}–{BINGO18_DICE_MAX}). Thứ tự nhập là thứ tự quay
            chính thức.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-2">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex size-6 items-center justify-center rounded-md bg-amber-100 dark:bg-amber-900/50">
                  <Dice5 className="size-3.5 text-amber-600 dark:text-amber-400" />
                </div>
                <Label className="text-sm font-semibold">Kết quả xúc xắc</Label>
                <RandomFillButton onFill={fillRandom} />
              </div>

              <div className="rounded-lg border bg-muted/30 p-4" onPaste={handleGridPaste}>
                <div className="grid grid-cols-3 gap-3">
                  {dice.map((value, i) => (
                    <div key={i} className="flex flex-col gap-1">
                      <span className="text-center text-xs font-medium text-muted-foreground">{i + 1}</span>
                      <Input
                        ref={(el) => {
                          inputRefs.current[i] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={value}
                        onChange={(e) => handleDiceChange(i, e.target.value)}
                        className={`h-11 w-full text-center text-lg font-bold tabular-nums ${validation.fieldErrors.has(i) ? "border-destructive" : ""}`}
                      />
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex items-center justify-between rounded-md border bg-background px-4 py-2.5">
                  <span className="text-sm text-muted-foreground">Tổng</span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-lg font-bold tabular-nums transition-colors ${
                        sum !== null ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground/40"
                      }`}
                    >
                      {sum ?? "—"}
                    </span>
                    {sum !== null && (
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                        {classifySum(sum)} · {sum % 2 === 0 ? "Chẵn" : "Lẻ"}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {pasteNotice && (
                <div className="rounded-lg border border-amber-300/50 bg-amber-50 px-4 py-3 dark:bg-amber-900/20">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="size-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-800 dark:text-amber-300">{pasteNotice}</p>
                  </div>
                </div>
              )}

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
                    placeholder="VD: 0183496"
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
                <div className="rounded-lg border border-blue-300/50 bg-blue-50 px-4 py-3 dark:bg-blue-900/20">
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

              {/* Cảnh báo lệch — MỌI kỳ, không chỉ kỳ đầu ngày (overview §4.3, chốt 29/08). Mềm, không chặn lưu. */}
              {periodMismatch && (
                <div className="rounded-lg border border-amber-300/50 bg-amber-50 px-4 py-3 dark:bg-amber-900/20">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-sm text-amber-800 dark:text-amber-300">
                        Mã kỳ vừa nhập (<span className="font-mono font-semibold">{trimmedPeriod}</span>) khác gợi ý hệ
                        thống (<span className="font-mono font-semibold">{suggestedPeriod}</span>).
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
