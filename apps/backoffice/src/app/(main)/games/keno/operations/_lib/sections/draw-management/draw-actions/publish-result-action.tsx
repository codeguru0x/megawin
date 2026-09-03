"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

import { MagicFetchResultButton } from "@/app/(main)/games/_lib/operations/magic-fetch-result-button";
import { formatResultDialogTitle } from "@/app/(main)/games/_lib/operations/result-dialog-title";
import { diffResultNumbers } from "@/app/(main)/games/_lib/operations/result-numbers-diff";
import { vietlottConfigHref } from "@/app/(main)/games/_lib/operations/vietlott-config-link";
import { VietlottReminderNote } from "@/app/(main)/games/_lib/operations/vietlott-reminder-note";
import { VietlottResultPanel } from "@/app/(main)/games/_lib/operations/vietlott-result-panel";
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
import { cn } from "@/lib/utils";

import type { DrawSelectorItem } from "../../../use-operations";
import { usePublishResult, useVietlottResult, useVietlottSuggestion } from "../../../use-operations";

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
    if (Number.isNaN(n) || n < KENO_NUMBER_MIN || n > KENO_NUMBER_MAX) {
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
    if (n == null) {
      continue;
    }
    const arr = posMap.get(n);
    if (arr) {
      arr.push(i);
    } else {
      posMap.set(n, [i]);
    }
  }
  for (const [value, positions] of posMap) {
    if (positions.length > 1) {
      messages.push(`Số ${pad2(value)} bị trùng (ô ${positions.map((i) => i + 1).join(", ")})`);
      for (const idx of positions) {
        fieldErrors.add(idx);
      }
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
  const [hasAppliedAutoResult, setHasAppliedAutoResult] = useState(false);
  // Chỉ hiện panel trạng thái (loading/not-found/conflict...) SAU KHI staff chủ động bấm nút
  // "Kết quả" — tránh thông báo "Chưa có kết quả cho kỳ này" xuất hiện ngay lúc mở dialog (query
  // vẫn tự fetch ngầm để phục vụ autofill Rule A, chỉ ẨN kết quả fetch khỏi UI cho tới khi user
  // yêu cầu). Ngoại lệ: `found = true` luôn hiện ngay (autofill tự động cũng cần xác nhận đã điền).
  const [hasManualFetch, setHasManualFetch] = useState(false);
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
      setHasAppliedAutoResult(false);
      setHasManualFetch(false);
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

  // Tự lấy kết quả Vietlott đã publish (ResultFeed) theo mã kỳ đang nhập — chỉ fetch khi
  // dialog mở và đã có mã kỳ. Đổi mã kỳ (user tự sửa ô input) tự động tạo query khác, tự refetch.
  const vietlottResultQuery = useVietlottResult(draw.drawId, trimmedPeriod, isOpen);

  function applyIncomingNumbers() {
    const data = vietlottResultQuery.data;
    if (!data?.found || !data.numbers) {
      return;
    }
    setNumbers(data.numbers.map((n) => n.padStart(2, "0")).slice(0, KENO_DRAW_COUNT));
    setValidation(VALID);
    setHasAppliedAutoResult(true);
  }

  // Tự động điền — CHỈ khi TẤT CẢ 20 ô đang rỗng (chưa nhập tay/chưa điền trước) — KHÔNG tự
  // điền phần thiếu khi form đã có bất kỳ số nào (dù chỉ 1/20), dù các ô rỗng còn lại có thể
  // điền được. Quy tắc bất biến, không đổi thành `.some()` hay biến thể "điền phần thiếu"
  // (plan §5.0 quy tắc A) — tránh tạo ra 1 kết quả LAI (nửa tay, nửa nguồn) không ai chủ động
  // xác nhận toàn bộ. Khi form không rỗng hoàn toàn, luồng đi vào diff (bên dưới) → staff tự
  // thấy lệch ở đâu → tự bấm "Áp dụng" nếu muốn ghi đè toàn bộ.
  useEffect(() => {
    const data = vietlottResultQuery.data;
    if (data?.found && data.numbers && numbers.every((n) => n.trim() === "") && !hasAppliedAutoResult) {
      setNumbers(data.numbers.map((n) => n.padStart(2, "0")).slice(0, KENO_DRAW_COUNT));
      setValidation(VALID);
      setHasAppliedAutoResult(true);
    }
  }, [vietlottResultQuery.data, numbers, hasAppliedAutoResult]);

  function handleMagicFetch() {
    // Reset cờ đã-áp-dụng để effect autofill (chỉ chạy khi form rỗng) có thể chạy lại, và để
    // khối trạng thái quay về mode "vừa lấy xong" nếu form đang rỗng.
    setHasAppliedAutoResult(false);
    setHasManualFetch(true);
    void vietlottResultQuery.refetch();
  }

  // So sánh số đang nhập với số ResultFeed trả về — dùng để highlight lệch trên lưới (§5.2)
  // và nội dung khối trạng thái (§6.3). Ô rỗng ở `numbers` tính là LỆCH (quy tắc bất biến §5.0
  // quy tắc B) — form điền dở phải thấy đúng số ô còn thiếu/khác, không đánh lừa bằng số nhỏ
  // hơn thực tế.
  const incomingNumbers = vietlottResultQuery.data?.found ? vietlottResultQuery.data.numbers : null;
  const diff = useMemo(
    () => (incomingNumbers ? diffResultNumbers(numbers, incomingNumbers) : null),
    [numbers, incomingNumbers],
  );
  const hasAnyNumber = numbers.some((n) => n.trim() !== "");
  // Chỉ highlight khi: có kết quả nguồn + form đã có ít nhất 1 số + thực sự lệch. Form rỗng
  // thì autofill tự điền, không có gì để so.
  const showDiff = !!diff && !diff.isIdentical && hasAnyNumber;

  // Ẩn state "chưa có kết quả cho kỳ này" cho tới khi staff CHỦ ĐỘNG bấm nút "Kết quả" — query
  // vẫn tự fetch ngầm ngay lúc mở dialog (phục vụ autofill Rule A + phát hiện lệch V4), nhưng
  // không cần dội thông báo "not-found" ngay khi vừa mở, dễ gây cảm giác báo lỗi giả. Khi
  // `found === true` thì LUÔN hiện ngay (autofill/so lệch tự động khi mở dialog vẫn phải thấy).
  const displayFound =
    hasManualFetch || vietlottResultQuery.data?.found === true ? vietlottResultQuery.data?.found : undefined;

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
      if (firstErrorIdx !== undefined) {
        inputRefs.current[firstErrorIdx]?.focus();
      }
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
                <Label className="font-semibold text-sm">20 số trúng</Label>
                <div className="ml-auto flex items-center gap-1">
                  <RandomFillButton onFill={fillRandom} />
                  <MagicFetchResultButton
                    onFetch={handleMagicFetch}
                    isFetching={hasManualFetch && vietlottResultQuery.isFetching}
                    disabled={!trimmedPeriod}
                  />
                </div>
              </div>

              <div className="rounded-lg border bg-muted/30 p-3" onPaste={handleGridPaste}>
                {/* Chú giải 2 loại số nhỏ trên lưới — chỉ hiện khi có lệch để tránh rối mắt lúc
                    bình thường. Dùng lại ĐÚNG hình dạng + màu của badge thứ tự và chip Vietlott
                    bên dưới, nhưng để TRỐNG số mẫu — số mẫu (VD "05") dễ bị đọc nhầm thành số
                    lượng ("5 số khác") thay vì minh hoạ hình dạng. Chỉ cần hình dạng + màu +
                    chữ mô tả, không cần số mẫu để nhận biết. */}
                {showDiff && (
                  <div className="mb-2.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-4 rounded-full bg-muted ring-1 ring-border" />
                      Thứ tự quay
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-4 rounded-full bg-amber-100 ring-1 ring-amber-300 dark:bg-amber-900/50 dark:ring-amber-700" />
                      Gợi ý Vietlott (ô lệch)
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-5 gap-x-2 gap-y-3">
                  {Array.from({ length: KENO_DRAW_COUNT }, (_, i) => {
                    const isDiff = showDiff && diff?.diffIndices.has(i);
                    return (
                      <div key={i} className="flex flex-col items-center gap-1">
                        <div className="relative w-full">
                          {/* Số thứ tự quay (1-20) — badge tròn nhỏ đè góc trên-trái ô input.
                              Tách hẳn HÌNH DẠNG (tròn, xám, đè góc) khỏi chip số Vietlott (bầu
                              dục, vàng, nằm dưới) để 2 loại số không còn nhìn lẫn như thiết kế
                              cũ (cả 2 đều là dòng chữ nhỏ, chỉ khác vị trí trên/dưới). */}
                          <span className="absolute -top-1.5 -left-1.5 z-10 flex size-4 items-center justify-center rounded-full bg-muted font-semibold text-[9px] text-muted-foreground ring-2 ring-background">
                            {i + 1}
                          </span>
                          <Input
                            ref={(el) => {
                              inputRefs.current[i] = el;
                            }}
                            type="text"
                            inputMode="numeric"
                            maxLength={2}
                            value={numbers[i]}
                            onChange={(e) => handleNumberChange(i, e.target.value)}
                            className={cn(
                              "w-full text-center font-mono font-semibold text-sm tabular-nums",
                              validation.fieldErrors.has(i) && "border-destructive",
                              !validation.fieldErrors.has(i) &&
                                isDiff &&
                                "border-amber-400 bg-amber-50/50 dark:bg-amber-900/20",
                            )}
                          />
                        </div>
                        {/* Chip số Vietlott cho ô lệch — dạng "pill" nền vàng, khác hẳn hình
                            dạng badge thứ tự ở trên → nhận biết ngay không cần đọc kỹ. Ô không
                            lệch giữ chip invisible (không phải display:none) để chiếm đúng chỗ,
                            lưới không giật khi bật/tắt diff toàn cục. */}
                        {showDiff && (
                          <span
                            className={cn(
                              "inline-flex h-4.5 items-center rounded-full px-1.5 font-mono font-semibold text-[10px] tabular-nums",
                              isDiff
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
                                : "invisible",
                            )}
                          >
                            {incomingNumbers?.[i]?.padStart(2, "0") ?? "00"}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
                    <span className="text-muted-foreground text-xs">Chẵn/Lẻ</span>
                    <span
                      className={`font-semibold text-sm tabular-nums ${stats ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground/40"}`}
                    >
                      {stats ? formatDominant(stats.evenCount, "Chẵn", stats.oddCount, "Lẻ") : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
                    <span className="text-muted-foreground text-xs">Lớn/Nhỏ</span>
                    <span
                      className={`font-semibold text-sm tabular-nums ${stats ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground/40"}`}
                    >
                      {stats ? formatDominant(stats.smallCount, "Nhỏ", stats.bigCount, "Lớn") : "—"}
                    </span>
                  </div>
                </div>
              </div>

              <VietlottResultPanel
                isLoading={hasManualFetch && vietlottResultQuery.isLoading}
                found={displayFound}
                hasAnyNumber={hasAnyNumber}
                alreadyApplied={hasAppliedAutoResult}
                diff={diff}
                totalCount={KENO_DRAW_COUNT}
                verifiedByHuman={vietlottResultQuery.data?.verifiedByHuman ?? null}
                sourceCount={vietlottResultQuery.data?.sourceCount ?? null}
                onApply={applyIncomingNumbers}
              />

              {pasteNotice && (
                <div className="rounded-lg border border-amber-300/50 bg-amber-50 px-4 py-3 dark:bg-amber-900/20">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <p className="text-amber-800 text-sm dark:text-amber-300">{pasteNotice}</p>
                  </div>
                </div>
              )}

              {validation.messages.length > 0 && (
                <div className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
                  {validation.messages.map((msg, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                      <p className="text-destructive text-sm">{msg}</p>
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
                <Label className="font-semibold text-sm">Tham chiếu Vietlott</Label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-muted-foreground text-xs">
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
                  <Label className="flex items-center gap-1.5 text-muted-foreground text-xs">
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
                    <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
                    <div className="space-y-1">
                      <p className="text-blue-800 text-sm leading-relaxed dark:text-blue-300">
                        {VIETLOTT_SUGGESTION_UNAVAILABLE_MESSAGES[suggestion.data.reason]}
                      </p>
                      {suggestion.data.reason === VietlottSuggestionUnavailableReason.NoAnchor && (
                        <Link
                          prefetch={false}
                          href={vietlottConfigLink}
                          className="font-medium text-blue-700 text-xs underline dark:text-blue-400"
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
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div className="space-y-1">
                      <p className="text-amber-800 text-sm dark:text-amber-300">
                        Mã kỳ vừa nhập (<span className="font-mono font-semibold">{trimmedPeriod}</span>) khác gợi ý hệ
                        thống (<span className="font-mono font-semibold">{suggestedPeriod}</span>).
                      </p>
                      <p className="text-amber-700 text-xs dark:text-amber-400">
                        Nếu giá trị vừa nhập đúng với trang Vietlott, hãy{" "}
                        <Link prefetch={false} href={vietlottConfigLink} className="font-medium underline">
                          cập nhật lại mã kỳ Vietlott
                        </Link>{" "}
                        ở cấu hình game để các kỳ sau tự tính đúng.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <VietlottReminderNote className="mt-2" />
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
