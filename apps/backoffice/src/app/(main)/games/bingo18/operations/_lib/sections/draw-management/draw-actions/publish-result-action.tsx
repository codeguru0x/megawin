"use client";

import { useState } from "react";
import { Check, Loader2, Send, ExternalLink, CalendarDays, Hash, Dice5 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DevRandomFillButton, generateRandomNumber } from "@/components/dev-random-fill-button";
import { todayVN } from "@megawin/shared/utils";
import type { DrawSelectorItem } from "../../../use-operations";
import { usePublishResult } from "../../../use-operations";

const DICE_COUNT = 3;
const DICE_MIN = 1;
const DICE_MAX = 6;

function validateDice(nums: string[]): string | null {
  for (let i = 0; i < DICE_COUNT; i++) {
    const n = Number(nums[i]);
    if (!n || !Number.isInteger(n) || n < DICE_MIN || n > DICE_MAX) {
      return `Xúc xắc #${i + 1} phải là số nguyên từ ${DICE_MIN} đến ${DICE_MAX}.`;
    }
  }
  return null;
}

/**
 * Dialog công bố kết quả kỳ quay Bingo 18.
 *
 * Bingo 18: nhập 3 số xúc xắc (1-6), không có Jackpot ref.
 * Sum tự tính và hiển thị preview.
 */
export function PublishResultAction({
  draw,
  disabled,
  open,
  onOpenChange,
}: {
  draw: DrawSelectorItem;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open !== undefined ? open : internalOpen;
  const setIsOpen = onOpenChange ?? setInternalOpen;

  const [numbers, setNumbers] = useState<string[]>(Array(DICE_COUNT).fill(""));
  const [vietlotDate, setVietlotDate] = useState(todayVN());
  const [vietlotPeriod, setVietlotPeriod] = useState("");
  const [error, setError] = useState<string | null>(null);
  const publishResult = usePublishResult();

  const sum = numbers.reduce((s, n) => s + (Number(n) || 0), 0);

  function handleSubmit() {
    setError(null);
    const err = validateDice(numbers);
    if (err) {
      setError(err);
      return;
    }

    const body: {
      diceNumbers: number[];
      vietlottRef?: { drawPeriod: string; drawDate: string };
    } = { diceNumbers: numbers.map(Number) };

    if (vietlotPeriod.trim()) {
      body.vietlottRef = { drawPeriod: vietlotPeriod.trim(), drawDate: vietlotDate };
    }

    publishResult.mutate(
      { drawId: draw.drawId, body },
      {
        onSuccess: () => {
          setIsOpen(false);
          setNumbers(Array(DICE_COUNT).fill(""));
          setVietlotPeriod("");
          setVietlotDate(todayVN());
          setError(null);
        },
      },
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Công bố kết quả — Kỳ {String(draw.drawNo).padStart(3, "0")} · {draw.drawDate}{" "}
            {draw.drawTime}
          </DialogTitle>
          <DialogDescription>Nhập 3 số xúc xắc (1–6). Tổng: 3–18.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex size-6 items-center justify-center rounded-md bg-amber-100 dark:bg-amber-900/50">
                <Dice5 className="size-3.5 text-amber-600 dark:text-amber-400" />
              </div>
              <Label className="text-sm font-semibold">Kết quả xúc xắc</Label>
              <DevRandomFillButton
                onFill={() => {
                  const nums = Array.from({ length: DICE_COUNT }, () =>
                    generateRandomNumber(DICE_MIN, DICE_MAX),
                  );
                  setNumbers(nums.map(String));
                  setError(null);
                }}
              />
            </div>
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center gap-3">
                {numbers.map((val, idx) => (
                  <Select
                    key={idx}
                    value={val}
                    onValueChange={(v) => {
                      const next = [...numbers];
                      next[idx] = v;
                      setNumbers(next);
                      setError(null);
                    }}
                  >
                    <SelectTrigger className="h-14 w-16 text-center text-2xl font-bold tabular-nums">
                      <SelectValue placeholder="?" />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <SelectItem key={n} value={String(n)} className="text-lg font-semibold">
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ))}
                <div className="flex items-center gap-2 ml-2">
                  <span className="text-xl text-muted-foreground">=</span>
                  <span className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
                    {sum > 0 ? sum : "?"}
                  </span>
                </div>
              </div>
            </div>
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
                  value={vietlotDate}
                  onChange={(e) => setVietlotDate(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Hash className="size-3" /> Mã kỳ Vietlott
                </Label>
                <Input
                  type="text"
                  value={vietlotPeriod}
                  onChange={(e) => setVietlotPeriod(e.target.value)}
                  placeholder="VD: 123456"
                  className="font-mono text-sm"
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
              <p className="text-sm font-medium text-destructive">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Huỷ bỏ
          </Button>
          <Button onClick={handleSubmit} disabled={publishResult.isPending || disabled}>
            {publishResult.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Check className="mr-2 size-4" />
            )}
            Xác nhận
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
