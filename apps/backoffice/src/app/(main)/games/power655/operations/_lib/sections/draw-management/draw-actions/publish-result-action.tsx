"use client";

import { useEffect, useRef, useState } from "react";

import { POWER655_MAIN_COUNT, POWER655_MAIN_MAX, POWER655_MAIN_MIN } from "@megawin/game-power655/entities";
import { todayVN } from "@megawin/shared/utils";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  Check,
  ClipboardCheck,
  Dice5,
  ExternalLink,
  Hash,
  Loader2,
  Star,
} from "lucide-react";

import { generateRandomNumber, generateUniqueRandomNumbers, RandomFillButton } from "@/components/draws";
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
import { usePublishResult } from "../../../use-operations";

const pad2 = (n: number) => String(n).padStart(2, "0");

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
    if (isNaN(n) || n < POWER655_MAIN_MIN || n > POWER655_MAIN_MAX) {
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
    if (n === null) continue;
    const arr = posMap.get(n);
    if (arr) arr.push(i);
    else posMap.set(n, [i]);
  }
  for (const [value, positions] of posMap) {
    if (positions.length > 1) {
      messages.push(`Số ${pad2(value)} bị trùng (ô ${positions.map((i) => i + 1).join(", ")})`);
      for (const idx of positions) mainErrors.add(idx);
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
    if (isNaN(bn) || bn < POWER655_MAIN_MIN || bn > POWER655_MAIN_MAX) {
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

  const [mains, setMains] = useState<string[]>(Array(POWER655_MAIN_COUNT).fill(""));
  const [bonus, setBonus] = useState("");
  const [vietlotDate, setVietlotDate] = useState(todayVN());
  const [vietlotPeriod, setVietlotPeriod] = useState("");
  const [validation, setValidation] = useState<ValidationResult>(VALID);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (isOpen && currentResult) {
      setMains(
        currentResult.winningMain.length === POWER655_MAIN_COUNT
          ? currentResult.winningMain.map((n) => n.padStart(2, "0"))
          : Array(POWER655_MAIN_COUNT).fill(""),
      );
      setBonus(currentResult.bonusNumber ? currentResult.bonusNumber.padStart(2, "0") : "");
      setVietlotDate(currentResult.vietlottRef?.drawDate ?? todayVN());
      setVietlotPeriod(currentResult.vietlottRef?.drawPeriod ?? "");
    } else if (!isOpen) {
      setMains(Array(POWER655_MAIN_COUNT).fill(""));
      setBonus("");
      setVietlotDate(todayVN());
      setVietlotPeriod("");
      setValidation(VALID);
    }
  }, [isOpen, currentResult]);

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
      if (firstIdx !== undefined) inputRefs.current[firstIdx]?.focus();
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
            {isRepublish ? "Sửa kết quả" : "Công bố kết quả"} — Kỳ {String(draw.drawNo).padStart(3, "0")} ·{" "}
            {draw.drawDate}
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
                  <Dice5 className="size-3.5 text-purple-600 dark:text-purple-400" />
                </div>
                <Label className="text-sm font-semibold">Kết quả quay số</Label>
                <RandomFillButton onFill={fillRandom} />
              </div>

              <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {POWER655_MAIN_COUNT} số chính (không trùng, {pad2(POWER655_MAIN_MIN)}–{pad2(POWER655_MAIN_MAX)})
                  </p>
                  <div className="grid grid-cols-6 gap-2">
                    {Array.from({ length: POWER655_MAIN_COUNT }, (_, i) => (
                      <div key={i} className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-muted-foreground text-center">{i + 1}</span>
                        <Input
                          ref={(el) => {
                            inputRefs.current[i] = el;
                          }}
                          type="text"
                          inputMode="numeric"
                          maxLength={2}
                          value={mains[i]}
                          onChange={(e) => handleMainChange(i, e.target.value)}
                          className={`w-full text-center font-mono text-sm font-semibold tabular-nums ${validation.mainErrors.has(i) ? "border-destructive" : ""}`}
                          placeholder={pad2(i + 1)}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t pt-3 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <ArrowRight className="size-3 text-amber-500" />
                    <p className="text-xs text-muted-foreground">
                      Số thưởng ({pad2(POWER655_MAIN_MIN)}–{pad2(POWER655_MAIN_MAX)}, khác 6 số chính)
                    </p>
                  </div>
                  <Input
                    type="text"
                    inputMode="numeric"
                    maxLength={2}
                    value={bonus}
                    onChange={(e) => setBonus(e.target.value.replace(/\D/g, "").slice(0, 2))}
                    className={`w-20 text-center font-mono text-sm font-semibold tabular-nums border-amber-200 dark:border-amber-800 ${validation.bonusError ? "border-destructive" : ""}`}
                    placeholder={pad2(POWER655_MAIN_MIN)}
                  />
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
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  Tùy chọn
                </span>
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
                      onChange={(e) => setVietlotPeriod(e.target.value)}
                    />
                  </div>
                </div>
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
