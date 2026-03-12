"use client";

import { useState } from "react";
import { Check, Loader2, ExternalLink, CalendarDays, Hash, Dice5 } from "lucide-react";
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
  DevRandomFillButton,
  generateUniqueRandomNumbers,
} from "@/components/dev-random-fill-button";
import {
  POWER655_MAIN_MIN,
  POWER655_MAIN_MAX,
  POWER655_MAIN_COUNT,
} from "@megawin/game-power655/entities";
import { todayVN } from "@megawin/shared/utils/date";
import type { DrawSelectorItem } from "../../../use-operations";
import { usePublishResult } from "../../../use-operations";

const pad2 = (n: number) => String(n).padStart(2, "0");

function validateMainNumbers(nums: string[]): string | null {
  const parsed = nums.map(Number);
  for (let i = 0; i < POWER655_MAIN_COUNT; i++) {
    const n = parsed[i];
    if (!n || !Number.isInteger(n) || n < POWER655_MAIN_MIN || n > POWER655_MAIN_MAX) {
      return `Số #${i + 1} phải là số nguyên từ ${pad2(POWER655_MAIN_MIN)} đến ${pad2(POWER655_MAIN_MAX)}.`;
    }
  }
  if (new Set(parsed).size !== POWER655_MAIN_COUNT) return "Các số phải khác nhau.";
  return null;
}

function validateBonusNumber(val: string, mainNums: string[]): string | null {
  const n = Number(val);
  if (!val || !Number.isInteger(n) || n < POWER655_MAIN_MIN || n > POWER655_MAIN_MAX) {
    return `Số thưởng phải là số nguyên từ ${pad2(POWER655_MAIN_MIN)} đến ${pad2(POWER655_MAIN_MAX)}.`;
  }
  if (mainNums.map(Number).includes(n)) return "Số thưởng phải khác tất cả 6 số chính.";
  return null;
}

/**
 * Dialog công bố kết quả kỳ quay Power 6/55.
 *
 * Power 6/55: nhập 6 số chính (01-55) + 1 số thưởng (bonus number, khác 6 số chính).
 * Bonus number dùng để xác định JP2 winner (trùng 5/6 chính + bonus).
 * Vietlott ref: tùy chọn, liên kết với kỳ quay chính thức.
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
  const [mainNumbers, setMainNumbers] = useState(["", "", "", "", "", ""]);
  const [bonusNumber, setBonusNumber] = useState("");
  const [vietlotDate, setVietlotDate] = useState(todayVN());
  const [vietlotPeriod, setVietlotPeriod] = useState("");
  const [error, setError] = useState<string | null>(null);
  const publishResult = usePublishResult();

  const isRepublish = draw.status === "published";

  function handleSubmit() {
    setError(null);
    const mainErr = validateMainNumbers(mainNumbers);
    if (mainErr) {
      setError(mainErr);
      return;
    }
    const bonusErr = validateBonusNumber(bonusNumber, mainNumbers);
    if (bonusErr) {
      setError(bonusErr);
      return;
    }

    const body: {
      winningMain: string[];
      bonusNumber: string;
      vietlottRef?: { drawPeriod: string; drawDate: string; drawSession: number };
    } = {
      winningMain: mainNumbers.map((n) => n.padStart(2, "0")),
      bonusNumber: bonusNumber.padStart(2, "0"),
    };

    if (vietlotPeriod.trim()) {
      body.vietlottRef = {
        drawPeriod: vietlotPeriod.trim(),
        drawDate: vietlotDate,
        drawSession: 1,
      };
    }

    publishResult.mutate(
      { drawId: draw.drawId, body },
      {
        onSuccess: () => {
          setIsOpen(false);
          setMainNumbers(["", "", "", "", "", ""]);
          setBonusNumber("");
          setVietlotPeriod("");
          setVietlotDate(todayVN());
          setError(null);
        },
      },
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isRepublish ? "Sửa kết quả" : "Cập nhật kết quả"} kỳ {draw.drawDate}
          </DialogTitle>
          <DialogDescription>
            Nhập {POWER655_MAIN_COUNT} số chính ({pad2(POWER655_MAIN_MIN)}–{pad2(POWER655_MAIN_MAX)}
            ) và 1 số thưởng.
            {isRepublish && " Kết quả cũ sẽ bị ghi đè. Chỉ có hiệu lực trước khi kết sổ."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* 6 số chính */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex size-6 items-center justify-center rounded-md bg-purple-100 dark:bg-purple-900/50">
                <Dice5 className="size-3.5 text-purple-600 dark:text-purple-400" />
              </div>
              <Label className="text-sm font-semibold">Kết quả quay số</Label>
              <DevRandomFillButton
                onFill={() => {
                  const mains = generateUniqueRandomNumbers(
                    POWER655_MAIN_COUNT,
                    POWER655_MAIN_MIN,
                    POWER655_MAIN_MAX,
                  );
                  // Bonus khác 6 số chính → pick ngẫu nhiên từ các số còn lại
                  const mainSet = new Set(mains);
                  const remaining = Array.from(
                    { length: POWER655_MAIN_MAX },
                    (_, i) => i + 1,
                  ).filter((n) => !mainSet.has(n));
                  const bonus = remaining[Math.floor(Math.random() * remaining.length)]!;
                  setMainNumbers(mains.map((n) => String(n).padStart(2, "0")));
                  setBonusNumber(String(bonus).padStart(2, "0"));
                  setError(null);
                }}
              />
            </div>
            <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
              {/* 6 số chính */}
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {POWER655_MAIN_COUNT} số chính (không trùng, {pad2(POWER655_MAIN_MIN)}–
                  {pad2(POWER655_MAIN_MAX)})
                </p>
                <div className="flex gap-2 flex-wrap">
                  {mainNumbers.map((val, idx) => (
                    <Input
                      key={idx}
                      type="text"
                      inputMode="numeric"
                      maxLength={2}
                      value={val}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                        const next = [...mainNumbers];
                        next[idx] = v;
                        setMainNumbers(next);
                        setError(null);
                      }}
                      className="w-14 text-center font-mono text-sm font-semibold tabular-nums"
                      placeholder={pad2(idx + 1)}
                    />
                  ))}
                </div>
              </div>

              {/* Số thưởng */}
              <div className="space-y-2 border-t pt-3">
                <p className="text-xs text-muted-foreground">
                  Số thưởng (bonus number, khác 6 số chính, {pad2(POWER655_MAIN_MIN)}–
                  {pad2(POWER655_MAIN_MAX)})
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">+</span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    maxLength={2}
                    value={bonusNumber}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                      setBonusNumber(v);
                      setError(null);
                    }}
                    className="w-14 text-center font-mono text-sm font-semibold tabular-nums bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-700"
                    placeholder="00"
                  />
                  <span className="text-xs text-muted-foreground/70">→ JP2 winner</span>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Tham chiếu Vietlott (optional) */}
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
                    <CalendarDays className="size-3" />
                    Ngày Vietlott
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
                    <Hash className="size-3" />
                    Mã kỳ Vietlott
                  </Label>
                  <Input
                    type="text"
                    value={vietlotPeriod}
                    onChange={(e) => setVietlotPeriod(e.target.value)}
                    placeholder="VD: 00123"
                    className="font-mono text-sm"
                  />
                </div>
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
