"use client";

import { useEffect, useRef, useState } from "react";

import Link from "next/link";

import { GameProduct } from "@megawin/game-core/entities";
import { VietlottSuggestionUnavailableReason } from "@megawin/game-core/utils";
import { KENO_DRAW_COUNT, KENO_NUMBER_MAX, KENO_NUMBER_MIN } from "@megawin/game-keno/entities";
import { computeDrawStats } from "@megawin/game-keno/helpers";
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
const vietlottConfigLink = vietlottConfigHref(GameProduct.Keno);

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

// ─── Dán nhanh (paste) — bóc số từ text copy nguyên khối (VD từ trang Vietlott) ─

/** Bóc mọi cụm 1-2 chữ số trong text dán vào, zero-pad về "01"-"80". */
function extractPastedTokens(raw: string): string[] {
  const matches = raw.match(/\d{1,2}/g) ?? [];
  return matches.map((m) => m.padStart(2, "0"));
}

// ─── Validate — 1 hàm duy nhất, trả messages + fieldErrors ─────────

function validateKenoNumbers(numbers: string[]): ValidationResult {
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
      messages.push(`Ô ${i + 1}: phải nhập đủ 2 chữ số (VD: ${pad2(KENO_NUMBER_MIN)})`);
      fieldErrors.add(i);
      parsed.push(null);
      continue;
    }
    const n = parseInt(v, 10);
    if (isNaN(n) || n < KENO_NUMBER_MIN || n > KENO_NUMBER_MAX) {
      messages.push(`Ô ${i + 1}: số ${v} ngoài dải ${pad2(KENO_NUMBER_MIN)}–${pad2(KENO_NUMBER_MAX)}`);
      fieldErrors.add(i);
      parsed.push(null);
    } else {
      parsed.push(n);
    }
  }

  if (emptyIndices.length > 0) {
    messages.push(`Còn ${emptyIndices.length} ô chưa nhập (ô ${emptyIndices.map((i) => i + 1).join(", ")})`);
  }

  // Check trùng
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

/**
 * Format hiển thị theo cách Vietlott: chỉ ghi phe áp đảo + số lượng, hoặc "Hoà"
 * nếu 2 phe bằng nhau (VD Chẵn 11 · Lẻ 9 → "Chẵn 11"; Nhỏ 12 · Lớn 8 → "Nhỏ 12").
 */
function formatDominant(countA: number, labelA: string, countB: number, labelB: string): string {
  if (countA === countB) {
    return "Hoà";
  }
  return countA > countB ? `${labelA} ${countA}` : `${labelB} ${countB}`;
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

  const [numbers, setNumbers] = useState<string[]>(Array(KENO_DRAW_COUNT).fill(""));
  const [vietlotDate, setVietlotDate] = useState(defaultVietlotDate);
  const [vietlotPeriod, setVietlotPeriod] = useState("");
  const [periodTouched, setPeriodTouched] = useState(false);
  const [validation, setValidation] = useState<ValidationResult>(VALID);
  const [pasteNotice, setPasteNotice] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Gợi ý mã kỳ Vietlott — chỉ fetch khi dialog mở (P0.5). Đọc neo + lịch từ config
  // DB phía server, không tính gì ở client.
  const suggestion = useVietlottSuggestion(draw.drawId, isOpen);
  const suggestedPeriod = suggestion.data?.suggestedPeriod ?? null;

  useEffect(() => {
    if (isOpen && currentResult) {
      setNumbers(
        currentResult.winningNumbers.length === KENO_DRAW_COUNT
          ? currentResult.winningNumbers.map((n) => n.padStart(2, "0"))
          : Array(KENO_DRAW_COUNT).fill(""),
      );
      setVietlotDate(currentResult.vietlottRef?.drawDate ?? defaultVietlotDate);
      setVietlotPeriod(currentResult.vietlottRef?.drawPeriod ?? "");
      setPeriodTouched(!!currentResult.vietlottRef?.drawPeriod);
    } else if (!isOpen) {
      setNumbers(Array(KENO_DRAW_COUNT).fill(""));
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

  function handleNumberChange(index: number, raw: string) {
    const cleaned = raw.replace(/\D/g, "").slice(0, 2);
    setNumbers((prev) => {
      const next = [...prev];
      next[index] = cleaned;
      return next;
    });
  }

  /**
   * Dán nguyên khối text copy từ nơi khác (VD trang kết quả Vietlott) vào ô bất kỳ
   * trong lưới 20 số → tự bóc số và điền vào đúng vị trí, không cần gõ tay từng ô.
   *
   * - Dán đủ đúng 20 số → điền lại toàn bộ lưới từ ô 1, chạy validate ngay.
   * - Dán thiếu (VD copy từng dòng 10 số) → điền tiếp từ ô đang focus.
   * - Số lượng không khớp (thường do lỡ copy kèm ngày/mã kỳ) → KHÔNG tự điền, báo
   *   rõ số lượng bóc được để tránh điền sai âm thầm (đường tiền không cho phép đoán).
   * - Dán 1 số lẻ vào 1 ô (paste thường) → bỏ qua, để browser xử lý như gõ tay.
   */
  function handleGridPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const tokens = extractPastedTokens(e.clipboardData.getData("text"));
    if (tokens.length < 2) {
      return;
    }
    e.preventDefault();

    if (tokens.length === KENO_DRAW_COUNT) {
      setNumbers(tokens);
      setValidation(validateKenoNumbers(tokens));
      setPasteNotice(null);
      requestAnimationFrame(() => inputRefs.current[KENO_DRAW_COUNT - 1]?.focus());
      return;
    }

    const targetIndex = inputRefs.current.indexOf(e.target as HTMLInputElement);
    const startIndex = targetIndex >= 0 ? targetIndex : 0;

    if (startIndex + tokens.length > KENO_DRAW_COUNT) {
      setPasteNotice(
        `Dán được ${tokens.length} số, không khớp đủ ${KENO_DRAW_COUNT} ô còn lại. Có thể đã copy kèm ngày/mã kỳ — chỉ copy đúng phần 20 số kết quả rồi dán lại.`,
      );
      return;
    }

    setPasteNotice(null);
    setNumbers((prev) => {
      const next = [...prev];
      tokens.forEach((t, i) => {
        next[startIndex + i] = t;
      });
      return next;
    });
    const lastFilled = startIndex + tokens.length - 1;
    requestAnimationFrame(() => inputRefs.current[Math.min(lastFilled + 1, KENO_DRAW_COUNT - 1)]?.focus());
  }

  function fillRandom() {
    const drawn = generateUniqueRandomNumbers(KENO_DRAW_COUNT, KENO_NUMBER_MIN, KENO_NUMBER_MAX);
    setNumbers(drawn.map((n) => pad2(n)));
    setValidation(VALID);
  }

  // Chỉ tính khi đủ 20 ô — tránh hiển thị số liệu nửa vời gây hiểu lầm đã đúng.
  const allFilled = numbers.every((n) => n.trim() !== "");
  const stats = allFilled ? computeDrawStats(numbers.map((n) => n.padStart(2, "0"))) : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = validateKenoNumbers(numbers);
    setValidation(result);
    if (result.messages.length > 0) {
      const firstErrorIdx = [...result.fieldErrors][0];
      if (firstErrorIdx !== undefined) inputRefs.current[firstErrorIdx]?.focus();
      return;
    }

    const winningNumbers = numbers.map((n) => n.padStart(2, "0"));

    const body: {
      winningNumbers: string[];
      vietlottRef?: { drawPeriod: string; drawDate: string };
    } = { winningNumbers };

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
            <ClipboardCheck className="size-4.5 text-orange-500" />
            {formatResultDialogTitle(draw.drawId, draw.drawTime)}
          </DialogTitle>
          <DialogDescription>
            Nhập {KENO_DRAW_COUNT} số trúng ({pad2(KENO_NUMBER_MIN)}–{pad2(KENO_NUMBER_MAX)}). Thứ tự nhập là thứ tự
            quay chính thức.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-2">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex size-6 items-center justify-center rounded-md bg-orange-100 dark:bg-orange-900/50">
                  <Dice5 className="size-3.5 text-orange-600 dark:text-orange-400" />
                </div>
                <Label className="text-sm font-semibold">20 số trúng (theo thứ tự quay)</Label>
                <RandomFillButton onFill={fillRandom} />
              </div>

              <div className="rounded-lg border bg-muted/30 p-3" onPaste={handleGridPaste}>
                <div className="grid grid-cols-5 gap-2">
                  {Array.from({ length: KENO_DRAW_COUNT }, (_, i) => (
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

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
                    <span className="text-xs text-muted-foreground">Chẵn/Lẻ</span>
                    <span
                      className={`text-sm font-semibold tabular-nums ${stats ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground/40"}`}
                    >
                      {stats ? formatDominant(stats.evenCount, "Chẵn", stats.oddCount, "Lẻ") : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
                    <span className="text-xs text-muted-foreground">Lớn/Nhỏ</span>
                    <span
                      className={`text-sm font-semibold tabular-nums ${stats ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground/40"}`}
                    >
                      {stats ? formatDominant(stats.smallCount, "Nhỏ", stats.bigCount, "Lớn") : "—"}
                    </span>
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
                    placeholder="VD: 123456"
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
