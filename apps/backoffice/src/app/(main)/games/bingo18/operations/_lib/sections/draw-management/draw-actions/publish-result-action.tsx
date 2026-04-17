"use client";

import { useState, useEffect } from "react";
import {
  Check,
  Loader2,
  ExternalLink,
  CalendarDays,
  Hash,
  Dice5,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RandomFillButton, generateRandomNumber } from "@/components/draws";
import { todayVN } from "@megawin/shared/utils";
import type { DrawSelectorItem } from "../../../use-operations";
import { usePublishResult } from "../../../use-operations";

const DICE_COUNT = 3;
const DICE_MIN = 1;
const DICE_MAX = 6;
const DICE_VALUES = [1, 2, 3, 4, 5, 6] as const;

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

// ─── Validate ───────────────────────────────────────────────────────

function validateDice(dice: (number | undefined)[]): ValidationResult {
  const messages: string[] = [];
  const fieldErrors = new Set<number>();
  const missing: number[] = [];

  for (let i = 0; i < DICE_COUNT; i++) {
    const d = dice[i];
    if (d === undefined || d === null) {
      missing.push(i);
      fieldErrors.add(i);
    } else if (!Number.isInteger(d) || d < DICE_MIN || d > DICE_MAX) {
      messages.push(`Xúc xắc ${i + 1}: giá trị ${d} ngoài dải ${DICE_MIN}–${DICE_MAX}`);
      fieldErrors.add(i);
    }
  }

  if (missing.length > 0) {
    messages.push(`Chưa chọn xúc xắc ${missing.map((i) => i + 1).join(", ")}`);
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

  const [dice, setDice] = useState<(number | undefined)[]>([undefined, undefined, undefined]);
  const [vietlotDate, setVietlotDate] = useState(todayVN());
  const [vietlotPeriod, setVietlotPeriod] = useState("");
  const [validation, setValidation] = useState<ValidationResult>(VALID);

  useEffect(() => {
    if (isOpen && currentResult?.diceNumbers?.length === 3) {
      setDice([...currentResult.diceNumbers]);
      setVietlotDate(currentResult.vietlottRef?.drawDate ?? todayVN());
      setVietlotPeriod(currentResult.vietlottRef?.drawPeriod ?? "");
    } else if (!isOpen) {
      setDice([undefined, undefined, undefined]);
      setVietlotDate(todayVN());
      setVietlotPeriod("");
      setValidation(VALID);
    }
  }, [isOpen, currentResult]);

  function handleDiceChange(index: number, value: number) {
    setDice((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function fillRandom() {
    const nums = Array.from({ length: DICE_COUNT }, () => generateRandomNumber(DICE_MIN, DICE_MAX));
    setDice(nums);
    setValidation(VALID);
  }

  const sum = dice.reduce<number>((s, d) => s + (d ?? 0), 0);
  const allSelected = dice.every((d) => d !== undefined);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = validateDice(dice);
    setValidation(result);
    if (result.messages.length > 0) return;

    const body: {
      numbers: number[];
      vietlottRef?: { drawPeriod: string; drawDate: string };
    } = { numbers: dice as number[] };

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
            {isRepublish ? "Sửa kết quả" : "Công bố kết quả"} — Kỳ{" "}
            {String(draw.drawNo).padStart(3, "0")} · {draw.drawDate} {draw.drawTime}
          </DialogTitle>
          <DialogDescription>Nhập 3 số xúc xắc (1–6). Tổng: 3–18.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-5 py-2">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex size-6 items-center justify-center rounded-md bg-amber-100 dark:bg-amber-900/50">
                  <Dice5 className="size-3.5 text-amber-600 dark:text-amber-400" />
                </div>
                <Label className="text-sm font-semibold">Kết quả xúc xắc</Label>
                <RandomFillButton onFill={fillRandom} />
              </div>

              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="grid grid-cols-3 gap-3">
                  {dice.map((value, i) => (
                    <div key={i} className="space-y-1">
                      <span className="block text-xs font-medium text-muted-foreground text-center">
                        {i + 1}
                      </span>
                      <Select
                        value={value != null ? String(value) : ""}
                        onValueChange={(v) => handleDiceChange(i, Number(v))}
                      >
                        <SelectTrigger
                          className={`h-14 w-full text-center text-2xl font-bold tabular-nums ${validation.fieldErrors.has(i) ? "border-destructive" : ""}`}
                        >
                          <SelectValue placeholder="?" />
                        </SelectTrigger>
                        <SelectContent>
                          {DICE_VALUES.map((n) => (
                            <SelectItem key={n} value={String(n)} className="text-lg font-semibold">
                              {n}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex items-center justify-between rounded-md border bg-background px-4 py-2.5">
                  <span className="text-sm text-muted-foreground">Tổng</span>
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className={`text-2xl font-bold tabular-nums transition-colors ${
                        allSelected
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-muted-foreground/40"
                      }`}
                    >
                      {allSelected ? sum : "—"}
                    </span>
                    {allSelected && (
                      <span className="text-xs text-muted-foreground">
                        ({sum <= 9 ? "Nhỏ" : sum <= 13 ? "Hoà" : "Lớn"} ·{" "}
                        {sum % 2 === 0 ? "Chẵn" : "Lẻ"})
                      </span>
                    )}
                  </div>
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
                      placeholder="VD: 123456"
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
