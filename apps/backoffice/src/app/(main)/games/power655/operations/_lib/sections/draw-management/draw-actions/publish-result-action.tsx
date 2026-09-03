"use client";

import { useEffect, useRef, useState } from "react";

import Link from "next/link";

import { GameProduct } from "@megawin/game-core/entities";
import { VietlottSuggestionUnavailableReason } from "@megawin/game-core/utils";
import { POWER655_MAIN_COUNT, POWER655_MAIN_MAX, POWER655_MAIN_MIN } from "@megawin/game-power655/entities";
import { displayVNDate } from "@megawin/shared/utils";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Check,
  ClipboardCheck,
  ExternalLink,
  Hash,
  HelpCircle,
  Loader2,
} from "lucide-react";

import { MagicFetchResultButton } from "@/app/(main)/games/_lib/operations/magic-fetch-result-button";
import { formatResultDialogTitle } from "@/app/(main)/games/_lib/operations/result-dialog-title";
import { diffResultNumbers, type ResultNumbersDiff } from "@/app/(main)/games/_lib/operations/result-numbers-diff";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { DrawSelectorItem } from "../../../use-operations";
import { usePublishResult, useVietlottResult, useVietlottSuggestion } from "../../../use-operations";

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Href tĩnh — build 1 lần ở module scope, dùng lại cho cả 2 nhắc nhở trong dialog. */
const vietlottConfigLink = vietlottConfigHref(GameProduct.Power655);

// ─── Types ──────────────────────────────────────────────────────────

export interface PublishResultCurrentValues {
  winningMain: string[];
  bonusNumber: string;
  vietlottRef?: { drawPeriod: string; drawDate: string };
}

interface ValidationResult {
  messages: string[];
  mainErrors: Set<number>;
  bonusError: boolean;
}

const VALID: ValidationResult = { messages: [], mainErrors: new Set(), bonusError: false };

// ─── Validate ───────────────────────────────────────────────────────

function validatePower655(mains: string[], bonus: string): ValidationResult {
  const messages: string[] = [];
  const mainErrors = new Set<number>();
  let bonusError = false;
  const parsed: (number | null)[] = [];
  const emptyIndices: number[] = [];

  for (let i = 0; i < mains.length; i++) {
    const v = mains[i]?.trim() ?? "";
    if (!v) {
      emptyIndices.push(i);
      mainErrors.add(i);
      parsed.push(null);
      continue;
    }
    if (v.length !== 2) {
      messages.push(`Ô ${i + 1}: phải nhập đủ 2 chữ số (VD: ${pad2(POWER655_MAIN_MIN)})`);
      mainErrors.add(i);
      parsed.push(null);
      continue;
    }
    const n = parseInt(v, 10);
    if (Number.isNaN(n) || n < POWER655_MAIN_MIN || n > POWER655_MAIN_MAX) {
      messages.push(`Ô ${i + 1}: số ${v} ngoài dải ${pad2(POWER655_MAIN_MIN)}–${pad2(POWER655_MAIN_MAX)}`);
      mainErrors.add(i);
      parsed.push(null);
    } else {
      parsed.push(n);
    }
  }

  if (emptyIndices.length > 0) {
    messages.push(`Còn ${emptyIndices.length} ô số chính chưa nhập (ô ${emptyIndices.map((i) => i + 1).join(", ")})`);
  }

  // Check trùng số chính
  const posMap = new Map<number, number[]>();
  for (let i = 0; i < parsed.length; i++) {
    const n = parsed[i] ?? null;
    if (n === null) {
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
        mainErrors.add(idx);
      }
    }
  }

  // Check số thưởng
  const bv = bonus.trim();
  if (!bv) {
    messages.push("Chưa nhập số thưởng");
    bonusError = true;
  } else if (bv.length !== 2) {
    messages.push(`Số thưởng: phải nhập đủ 2 chữ số (VD: ${pad2(POWER655_MAIN_MIN)})`);
    bonusError = true;
  } else {
    const bn = parseInt(bv, 10);
    if (Number.isNaN(bn) || bn < POWER655_MAIN_MIN || bn > POWER655_MAIN_MAX) {
      messages.push(`Số thưởng ${bv} ngoài dải ${pad2(POWER655_MAIN_MIN)}–${pad2(POWER655_MAIN_MAX)}`);
      bonusError = true;
    } else {
      // Bonus phải khác tất cả 6 số chính
      const mainSet = new Set(parsed.filter((n): n is number => n !== null));
      if (mainSet.has(bn)) {
        const dupePositions = parsed
          .map((n, idx) => (n === bn ? idx + 1 : null))
          .filter((p): p is number => p !== null);
        messages.push(`Số thưởng ${pad2(bn)} trùng với số chính (ô ${dupePositions.join(", ")})`);
        bonusError = true;
      }
    }
  }

  return messages.length > 0 ? { messages, mainErrors, bonusError } : VALID;
}

// ─── Component ──────────────────────────────────────────────────────

/**
 * Dialog công bố kết quả kỳ quay Power 6/55.
 *
 * Power 6/55: nhập 6 số chính (01–55) + 1 số thưởng (bonus number, khác 6 số chính).
 * Bonus number dùng để xác định JP2 winner (trùng 5/6 chính + bonus).
 * Vietlott ref: tùy chọn, liên kết với kỳ quay chính thức.
 */
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

  const [mains, setMains] = useState<string[]>(Array(POWER655_MAIN_COUNT).fill(""));
  const [bonus, setBonus] = useState("");
  const [vietlotDate, setVietlotDate] = useState(defaultVietlotDate);
  const [vietlotPeriod, setVietlotPeriod] = useState("");
  const [periodTouched, setPeriodTouched] = useState(false);
  const [validation, setValidation] = useState<ValidationResult>(VALID);
  const [hasAppliedAutoResult, setHasAppliedAutoResult] = useState(false);
  // Chỉ hiện panel trạng thái (loading/not-found/conflict...) SAU KHI staff chủ động bấm nút
  // "Kết quả" — tránh thông báo "Chưa có kết quả cho kỳ này" xuất hiện ngay lúc mở dialog (query
  // vẫn tự fetch ngầm để phục vụ autofill Rule A, chỉ ẨN kết quả fetch khỏi UI cho tới khi user
  // yêu cầu). Ngoại lệ: `found = true` luôn hiện ngay (autofill tự động cũng cần xác nhận đã điền).
  const [hasManualFetch, setHasManualFetch] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Gợi ý mã kỳ Vietlott — chỉ fetch khi dialog mở (P4). Đọc neo + lịch từ config
  // DB phía server, không tính gì ở client.
  const suggestion = useVietlottSuggestion(draw.drawId, isOpen);
  const suggestedPeriod = suggestion.data?.suggestedPeriod ?? null;

  useEffect(() => {
    if (isOpen && currentResult) {
      setMains(
        currentResult.winningMain.length === POWER655_MAIN_COUNT
          ? currentResult.winningMain.map((n) => n.padStart(2, "0"))
          : Array(POWER655_MAIN_COUNT).fill(""),
      );
      setBonus(currentResult.bonusNumber ? currentResult.bonusNumber.padStart(2, "0") : "");
      setVietlotDate(currentResult.vietlottRef?.drawDate ?? defaultVietlotDate);
      setVietlotPeriod(currentResult.vietlottRef?.drawPeriod ?? "");
      setPeriodTouched(!!currentResult.vietlottRef?.drawPeriod);
    } else if (!isOpen) {
      setMains(Array(POWER655_MAIN_COUNT).fill(""));
      setBonus("");
      setVietlotDate(defaultVietlotDate);
      setVietlotPeriod("");
      setPeriodTouched(false);
      setValidation(VALID);
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

  // numbers[] (flat): 7 phần tử, phần tử cuối = số thưởng bonus (§9 plan 08).
  function applyIncomingNumbers() {
    const data = vietlottResultQuery.data;
    if (!data?.found || !data.numbers || data.numbers.length < POWER655_MAIN_COUNT + 1) {
      return;
    }
    setMains(data.numbers.slice(0, POWER655_MAIN_COUNT).map((n) => n.padStart(2, "0")));
    setBonus(data.numbers[POWER655_MAIN_COUNT]?.padStart(2, "0") ?? "");
    setValidation(VALID);
    setHasAppliedAutoResult(true);
  }

  // Tự động điền — CHỈ khi TẤT CẢ ô (main + bonus) đang rỗng — KHÔNG tự điền phần thiếu khi
  // form đã có bất kỳ số nào (quy tắc bất biến §5.0/§11.0 quy tắc A, áp dụng cho TOÀN FORM).
  useEffect(() => {
    const data = vietlottResultQuery.data;
    const isEmpty = mains.every((n) => n.trim() === "") && bonus.trim() === "";
    if (
      data?.found &&
      data.numbers &&
      data.numbers.length >= POWER655_MAIN_COUNT + 1 &&
      isEmpty &&
      !hasAppliedAutoResult
    ) {
      setMains(data.numbers.slice(0, POWER655_MAIN_COUNT).map((n) => n.padStart(2, "0")));
      setBonus(data.numbers[POWER655_MAIN_COUNT]?.padStart(2, "0") ?? "");
      setValidation(VALID);
      setHasAppliedAutoResult(true);
    }
  }, [vietlottResultQuery.data, mains, bonus, hasAppliedAutoResult]);

  function handleMagicFetch() {
    // Reset cờ đã-áp-dụng để effect autofill (chỉ chạy khi form rỗng) có thể chạy lại, và để
    // khối trạng thái quay về mode "vừa lấy xong" nếu form đang rỗng.
    setHasAppliedAutoResult(false);
    setHasManualFetch(true);
    void vietlottResultQuery.refetch();
  }

  // So sánh số đang nhập với số ResultFeed — gọi `diffResultNumbers` 2 LẦN (main + bonus),
  // KHÔNG gộp thành 1 mảng phẳng (plan §11.0 quy tắc B).
  const incomingMain = vietlottResultQuery.data?.found
    ? (vietlottResultQuery.data.numbers?.slice(0, POWER655_MAIN_COUNT) ?? null)
    : null;
  const incomingBonus = vietlottResultQuery.data?.found
    ? (vietlottResultQuery.data.numbers?.[POWER655_MAIN_COUNT]?.padStart(2, "0") ?? null)
    : null;
  const mainDiff: ResultNumbersDiff | null = incomingMain ? diffResultNumbers(mains, incomingMain) : null;
  const bonusDiff: ResultNumbersDiff | null = incomingBonus ? diffResultNumbers([bonus], [incomingBonus]) : null;
  const hasAnyNumber = mains.some((n) => n.trim() !== "") || bonus.trim() !== "";
  const showMainDiff = !!mainDiff && !mainDiff.isIdentical && hasAnyNumber;
  const showBonusDiff = !!bonusDiff && !bonusDiff.isIdentical && hasAnyNumber;
  const showDiff = showMainDiff || showBonusDiff;
  const combinedDiff: ResultNumbersDiff | null =
    mainDiff && bonusDiff
      ? {
          diffIndices: new Set([
            ...mainDiff.diffIndices,
            ...[...bonusDiff.diffIndices].map((i) => POWER655_MAIN_COUNT + i),
          ]),
          diffCount: mainDiff.diffCount + bonusDiff.diffCount,
          isIdentical: mainDiff.isIdentical && bonusDiff.isIdentical,
          sameSetDifferentOrder: false,
        }
      : null;

  const displayFound =
    hasManualFetch || vietlottResultQuery.data?.found === true ? vietlottResultQuery.data?.found : undefined;

  function handleMainChange(index: number, raw: string) {
    const cleaned = raw.replace(/\D/g, "").slice(0, 2);
    setMains((prev) => {
      const next = [...prev];
      next[index] = cleaned;
      return next;
    });
  }

  function fillRandom() {
    const mainNums = generateUniqueRandomNumbers(POWER655_MAIN_COUNT, POWER655_MAIN_MIN, POWER655_MAIN_MAX);
    const mainSet = new Set(mainNums);
    const remaining = Array.from({ length: POWER655_MAIN_MAX }, (_, i) => i + 1).filter((n) => !mainSet.has(n));
    const bonusNum = remaining[Math.floor(Math.random() * remaining.length)]!;
    setMains(mainNums.map((n) => pad2(n)));
    setBonus(pad2(bonusNum));
    setValidation(VALID);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = validatePower655(mains, bonus);
    setValidation(result);
    if (result.messages.length > 0) {
      const firstIdx = [...result.mainErrors][0];
      if (firstIdx !== undefined) {
        inputRefs.current[firstIdx]?.focus();
      }
      return;
    }

    const body: {
      winningMain: string[];
      bonusNumber: string;
      vietlottRef?: { drawPeriod: string; drawDate: string };
    } = {
      winningMain: mains.map((n) => n.padStart(2, "0")),
      bonusNumber: bonus.padStart(2, "0"),
    };

    if (vietlotPeriod.trim()) {
      body.vietlottRef = { drawPeriod: vietlotPeriod.trim(), drawDate: vietlotDate };
    }

    publishResult.mutate({ drawId: draw.drawId, body }, { onSuccess: () => setIsOpen(false) });
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="size-4.5 text-purple-500" />
            {formatResultDialogTitle(draw.drawId, draw.drawTime)}
          </DialogTitle>
          <DialogDescription>
            Nhập {POWER655_MAIN_COUNT} số chính ({pad2(POWER655_MAIN_MIN)}–{pad2(POWER655_MAIN_MAX)}) và 1 số thưởng
            (khác 6 số chính).
            {isRepublish && " Kết quả cũ sẽ bị ghi đè. Chỉ có hiệu lực trước khi kết sổ."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-6 py-2">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex size-6 items-center justify-center rounded-md bg-purple-100 dark:bg-purple-900/50">
                  <ArrowRight className="size-3.5 text-purple-600 dark:text-purple-400" />
                </div>
                <Label className="font-semibold text-sm">Kết quả quay số</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="size-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    {POWER655_MAIN_COUNT} số chính (không trùng, {pad2(POWER655_MAIN_MIN)}–{pad2(POWER655_MAIN_MAX)}) và
                    1 số thưởng (khác 6 số chính).
                  </TooltipContent>
                </Tooltip>
                <div className="ml-auto flex items-center gap-1">
                  <RandomFillButton onFill={fillRandom} />
                  <MagicFetchResultButton
                    onFetch={handleMagicFetch}
                    isFetching={hasManualFetch && vietlottResultQuery.isFetching}
                    disabled={!trimmedPeriod}
                  />
                </div>
              </div>

              <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
                {showDiff && (
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-4 rounded-full bg-muted ring-1 ring-border" />
                      Thứ tự
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-4 rounded-full bg-amber-100 ring-1 ring-amber-300 dark:bg-amber-900/50 dark:ring-amber-700" />
                      Gợi ý Vietlott (ô lệch)
                    </span>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="grid grid-cols-6 gap-x-2 gap-y-3">
                    {Array.from({ length: POWER655_MAIN_COUNT }, (_, i) => {
                      const isDiff = showMainDiff && mainDiff?.diffIndices.has(i);
                      return (
                        <div key={i} className="flex flex-col items-center gap-1">
                          <div className="relative w-full">
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
                              value={mains[i]}
                              onChange={(e) => handleMainChange(i, e.target.value)}
                              className={cn(
                                "w-full text-center font-mono font-semibold text-sm tabular-nums",
                                validation.mainErrors.has(i) && "border-destructive",
                                !validation.mainErrors.has(i) &&
                                  isDiff &&
                                  "border-amber-400 bg-amber-50/50 dark:bg-amber-900/20",
                              )}
                            />
                          </div>
                          {showMainDiff && (
                            <span
                              className={cn(
                                "inline-flex h-4.5 items-center rounded-full px-1.5 font-mono font-semibold text-[10px] tabular-nums",
                                isDiff
                                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
                                  : "invisible",
                              )}
                            >
                              {incomingMain?.[i]?.padStart(2, "0") ?? "00"}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2 border-t pt-3">
                  <div className="flex items-center gap-1.5">
                    <ArrowRight className="size-3 text-amber-500" />
                    <p className="text-muted-foreground text-xs">
                      Số thưởng ({pad2(POWER655_MAIN_MIN)}–{pad2(POWER655_MAIN_MAX)}, khác 6 số chính)
                    </p>
                  </div>
                  <div className="flex w-fit flex-col items-center gap-1">
                    <div className="relative w-20">
                      <span className="absolute -top-1.5 -left-1.5 z-10 flex size-4 items-center justify-center rounded-full bg-muted font-semibold text-[9px] text-muted-foreground ring-2 ring-background">
                        1
                      </span>
                      <Input
                        type="text"
                        inputMode="numeric"
                        maxLength={2}
                        value={bonus}
                        onChange={(e) => setBonus(e.target.value.replace(/\D/g, "").slice(0, 2))}
                        className={cn(
                          "w-20 border-amber-200 text-center font-mono font-semibold text-sm tabular-nums dark:border-amber-800",
                          validation.bonusError && "border-destructive",
                          !validation.bonusError &&
                            showBonusDiff &&
                            bonusDiff?.diffIndices.has(0) &&
                            "border-amber-400 bg-amber-50/50 dark:bg-amber-900/20",
                        )}
                      />
                    </div>
                    {showBonusDiff && (
                      <span
                        className={cn(
                          "inline-flex h-4.5 items-center rounded-full px-1.5 font-mono font-semibold text-[10px] tabular-nums",
                          bonusDiff?.diffIndices.has(0)
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
                            : "invisible",
                        )}
                      >
                        {incomingBonus ?? "00"}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <VietlottResultPanel
                isLoading={hasManualFetch && vietlottResultQuery.isLoading}
                found={displayFound}
                hasAnyNumber={hasAnyNumber}
                alreadyApplied={hasAppliedAutoResult}
                diff={combinedDiff}
                totalCount={POWER655_MAIN_COUNT + 1}
                verifiedByHuman={vietlottResultQuery.data?.verifiedByHuman ?? null}
                sourceCount={vietlottResultQuery.data?.sourceCount ?? null}
                onApply={applyIncomingNumbers}
              />

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
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="mb-3 text-muted-foreground text-xs">
                  Liên kết kỳ quay với dữ liệu Vietlott chính thức để đối soát
                </p>
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

                {/* Cảnh báo lệch — MỌI kỳ, không chỉ kỳ đầu (overview §4.3). Mềm, không chặn lưu. */}
                {periodMismatch && (
                  <div className="mt-3 rounded-lg border border-amber-300/50 bg-amber-50 px-4 py-3 dark:bg-amber-900/20">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                      <div className="space-y-1">
                        <p className="text-amber-800 text-sm dark:text-amber-300">
                          Mã kỳ vừa nhập (<span className="font-mono font-semibold">{trimmedPeriod}</span>) khác gợi ý
                          hệ thống (<span className="font-mono font-semibold">{suggestedPeriod}</span>).
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
