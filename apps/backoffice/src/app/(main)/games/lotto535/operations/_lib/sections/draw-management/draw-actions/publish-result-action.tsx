"use client";

import { useState } from "react";
import { Check, Loader2, ExternalLink, CalendarDays, Hash, Dice5, Star } from "lucide-react";
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
  generateRandomNumber,
} from "@/components/dev-random-fill-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LOTTO535_MAIN_MIN,
  LOTTO535_MAIN_MAX,
  LOTTO535_MAIN_COUNT,
  LOTTO535_SPECIAL_MIN,
  LOTTO535_SPECIAL_MAX,
} from "@megawin/game-lotto535/entities";
import { todayVN } from "@megawin/shared/utils/date";
import type { DrawSelectorItem } from "../../../use-operations";
import { usePublishResult } from "../../../use-operations";

const pad2 = (n: number) => String(n).padStart(2, "0");

function validateMainNumbers(nums: string[]): string | null {
  const parsed = nums.map(Number);
  for (let i = 0; i < LOTTO535_MAIN_COUNT; i++) {
    const n = parsed[i];
    if (!n || !Number.isInteger(n) || n < LOTTO535_MAIN_MIN || n > LOTTO535_MAIN_MAX) {
      return `Số chính #${i + 1} phải là số nguyên từ ${pad2(LOTTO535_MAIN_MIN)} đến ${pad2(LOTTO535_MAIN_MAX)}.`;
    }
  }
  if (new Set(parsed).size !== LOTTO535_MAIN_COUNT) return "Các số chính phải khác nhau.";
  return null;
}

function validateSpecialNumber(val: string): string | null {
  const n = Number(val);
  if (!n || !Number.isInteger(n) || n < LOTTO535_SPECIAL_MIN || n > LOTTO535_SPECIAL_MAX) {
    return `Số đặc biệt phải là số nguyên từ ${pad2(LOTTO535_SPECIAL_MIN)} đến ${pad2(LOTTO535_SPECIAL_MAX)}.`;
  }
  return null;
}

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
  const [mainNumbers, setMainNumbers] = useState(["", "", "", "", ""]);
  const [specialNumber, setSpecialNumber] = useState("");
  const [vietlotDate, setVietlotDate] = useState(todayVN());
  const [vietlotPeriod, setVietlotPeriod] = useState("");
  const [vietlotSession, setVietlotSession] = useState(String(draw.drawNo ?? 1));
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
    const specialErr = validateSpecialNumber(specialNumber);
    if (specialErr) {
      setError(specialErr);
      return;
    }

    const body: {
      winningMain: string[];
      winningSpecial: string;
      vietlottRef?: {
        drawPeriod: string;
        drawDate: string;
        drawSession: number;
      };
    } = {
      winningMain: mainNumbers.map((n) => n.padStart(2, "0")),
      winningSpecial: specialNumber.padStart(2, "0"),
    };

    if (vietlotPeriod.trim()) {
      body.vietlottRef = {
        drawPeriod: vietlotPeriod.trim(),
        drawDate: vietlotDate,
        drawSession: Number(vietlotSession),
      };
    }

    publishResult.mutate(
      { drawId: draw.drawId, body },
      {
        onSuccess: () => {
          setIsOpen(false);
          setMainNumbers(["", "", "", "", ""]);
          setSpecialNumber("");
          setVietlotPeriod("");
          setVietlotDate(todayVN());
          setVietlotSession(String(draw.drawNo ?? 1));
          setError(null);
        },
      },
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isRepublish ? "Sửa kết quả" : "Cập nhật kết quả"} kỳ {draw.drawId}
          </DialogTitle>
          <DialogDescription>
            Nhập {LOTTO535_MAIN_COUNT} số chính ({pad2(LOTTO535_MAIN_MIN)}–{pad2(LOTTO535_MAIN_MAX)}
            ) và 1 số đặc biệt ({pad2(LOTTO535_SPECIAL_MIN)}–{pad2(LOTTO535_SPECIAL_MAX)}).
            {isRepublish && " Kết quả cũ sẽ bị ghi đè. Chỉ có hiệu lực trước khi kết sổ."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Kết quả quay số */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex size-6 items-center justify-center rounded-md bg-violet-100 dark:bg-violet-900/50">
                <Dice5 className="size-3.5 text-violet-600 dark:text-violet-400" />
              </div>
              <Label className="text-sm font-semibold">Kết quả quay số</Label>
              <DevRandomFillButton
                onFill={() => {
                  const mains = generateUniqueRandomNumbers(
                    LOTTO535_MAIN_COUNT,
                    LOTTO535_MAIN_MIN,
                    LOTTO535_MAIN_MAX,
                  );
                  setMainNumbers(mains.map((n) => String(n).padStart(2, "0")));
                  setSpecialNumber(
                    String(
                      generateRandomNumber(LOTTO535_SPECIAL_MIN, LOTTO535_SPECIAL_MAX),
                    ).padStart(2, "0"),
                  );
                  setError(null);
                }}
              />
            </div>
            <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {LOTTO535_MAIN_COUNT} số chính (không trùng)
                </p>
                <div className="flex gap-2">
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
                      className="w-16 text-center font-mono text-sm font-semibold tabular-nums"
                      placeholder={pad2(idx + 1)}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Star className="size-3 text-amber-500" />
                  <p className="text-xs text-muted-foreground">
                    Số đặc biệt ({pad2(LOTTO535_SPECIAL_MIN)}–{pad2(LOTTO535_SPECIAL_MAX)})
                  </p>
                </div>
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  value={specialNumber}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                    setSpecialNumber(v);
                    setError(null);
                  }}
                  className="w-20 text-center font-mono text-sm font-semibold tabular-nums border-amber-200 dark:border-amber-800"
                  placeholder={pad2(LOTTO535_SPECIAL_MIN)}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Tham chiếu Vietlott */}
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
              <div className="grid grid-cols-3 gap-3">
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
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Phiên quay</Label>
                  <Select value={vietlotSession} onValueChange={setVietlotSession}>
                    <SelectTrigger className="font-mono text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Phiên 1 (13h)</SelectItem>
                      <SelectItem value="2">Phiên 2 (21h)</SelectItem>
                    </SelectContent>
                  </Select>
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
          <Button onClick={handleSubmit} disabled={publishResult.isPending}>
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
