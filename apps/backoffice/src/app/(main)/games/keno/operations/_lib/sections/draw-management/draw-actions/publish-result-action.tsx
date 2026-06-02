"use client";

import { useState, useEffect, useRef } from "react";
import {
  Check,
  Loader2,
  Dice5,
  ExternalLink,
  CalendarDays,
  Hash,
  ClipboardCheck,
  AlertCircle,
} from "lucide-react";
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
import { RandomFillButton, generateUniqueRandomNumbers } from "@/components/draws";
import { todayVN } from "@megawin/shared/utils";
import { KENO_NUMBER_MIN, KENO_NUMBER_MAX, KENO_DRAW_COUNT } from "@megawin/game-keno/entities";
import type { DrawSelectorItem } from "../../../use-operations";
import { usePublishResult } from "../../../use-operations";
import { DrawStatus } from "@megawin/game-core/entities";

const pad2 = (n: number) => String(n).padStart(2, "0");

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
      messages.push(
        `Ô ${i + 1}: số ${v} ngoài dải ${pad2(KENO_NUMBER_MIN)}–${pad2(KENO_NUMBER_MAX)}`,
      );
      fieldErrors.add(i);
      parsed.push(null);
    } else {
      parsed.push(n);
    }
  }

  if (emptyIndices.length > 0) {
    messages.push(
      `Còn ${emptyIndices.length} ô chưa nhập (ô ${emptyIndices.map((i) => i + 1).join(", ")})`,
    );
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
  // Form thống nhất cho mọi trạng thái: luôn submit qua /publish-result.
  // Backend tự quyết định publish lần đầu / republish (kéo resettle) / chỉ cập
  // nhật vietlottRef dựa trên settledAt + so sánh winningNumbers cũ vs mới.
  const isRepublish = draw.status === DrawStatus.Published || draw.status === DrawStatus.Settled;

  const [numbers, setNumbers] = useState<string[]>(Array(KENO_DRAW_COUNT).fill(""));
  const [vietlotDate, setVietlotDate] = useState(todayVN());
  const [vietlotPeriod, setVietlotPeriod] = useState("");
  const [validation, setValidation] = useState<ValidationResult>(VALID);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (isOpen && currentResult) {
      setNumbers(
        currentResult.winningNumbers.length === KENO_DRAW_COUNT
          ? currentResult.winningNumbers.map((n) => n.padStart(2, "0"))
          : Array(KENO_DRAW_COUNT).fill(""),
      );
      setVietlotDate(currentResult.vietlottRef?.drawDate ?? todayVN());
      setVietlotPeriod(currentResult.vietlottRef?.drawPeriod ?? "");
    } else if (!isOpen) {
      setNumbers(Array(KENO_DRAW_COUNT).fill(""));
      setVietlotDate(todayVN());
      setVietlotPeriod("");
      setValidation(VALID);
    }
  }, [isOpen, currentResult]);

  function handleNumberChange(index: number, raw: string) {
    const cleaned = raw.replace(/\D/g, "").slice(0, 2);
    setNumbers((prev) => {
      const next = [...prev];
      next[index] = cleaned;
      return next;
    });
  }

  function fillRandom() {
    const drawn = generateUniqueRandomNumbers(KENO_DRAW_COUNT, KENO_NUMBER_MIN, KENO_NUMBER_MAX);
    setNumbers(drawn.map((n) => pad2(n)));
    setValidation(VALID);
  }

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
            {isRepublish ? "Sửa kết quả" : "Công bố kết quả"} — Kỳ {draw.drawId}
          </DialogTitle>
          <DialogDescription>
            Nhập {KENO_DRAW_COUNT} số trúng ({pad2(KENO_NUMBER_MIN)}–{pad2(KENO_NUMBER_MAX)}). Thứ
            tự nhập là thứ tự quay chính thức.
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

              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="grid grid-cols-5 gap-2">
                  {Array.from({ length: KENO_DRAW_COUNT }, (_, i) => (
                    <div key={i} className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground text-center">
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
                        className={`w-full text-center font-mono text-sm font-semibold tabular-nums ${validation.fieldErrors.has(i) ? "border-destructive" : ""}`}
                        placeholder={pad2(i + 1)}
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
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  Tùy chọn
                </span>
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
                    onChange={(e) => setVietlotPeriod(e.target.value)}
                  />
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
