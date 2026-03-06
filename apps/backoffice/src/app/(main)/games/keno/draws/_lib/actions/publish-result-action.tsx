"use client";

import { useState } from "react";
import {
  Check,
  Loader2,
  Send,
  ExternalLink,
  CalendarDays,
  Hash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  DevRandomFillButton,
  generateUniqueRandomNumbers,
} from "@/components/dev-random-fill-button";
import {
  KENO_DRAW_COUNT,
  KENO_NUMBER_MIN,
  KENO_NUMBER_MAX,
} from "@megawin/game-keno/entities";
import { todayVN, formatVNTime } from "@megawin/shared/utils/date";
import type { KenoCurrentDrawInfo } from "../use-draws";
import { useKenoPublishResult } from "../use-draws";

function validateNumbers(nums: string[]): string | null {
  const parsed = nums.map(Number);
  for (let i = 0; i < KENO_DRAW_COUNT; i++) {
    const n = parsed[i];
    if (
      !n ||
      !Number.isInteger(n) ||
      n < KENO_NUMBER_MIN ||
      n > KENO_NUMBER_MAX
    ) {
      return `Số #${i + 1} phải là số nguyên từ ${String(KENO_NUMBER_MIN).padStart(2, "0")} đến ${String(KENO_NUMBER_MAX).padStart(2, "0")}.`;
    }
  }
  if (new Set(parsed).size !== KENO_DRAW_COUNT) return "Các số phải khác nhau.";
  return null;
}

export function PublishResultAction({
  draw,
  disabled,
}: {
  draw: KenoCurrentDrawInfo;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [numbers, setNumbers] = useState<string[]>(
    Array(KENO_DRAW_COUNT).fill("")
  );
  const [vietlotDate, setVietlotDate] = useState(todayVN());
  const [vietlotPeriod, setVietlotPeriod] = useState("");
  const [error, setError] = useState<string | null>(null);
  const publishResult = useKenoPublishResult();

  const isRepublish = draw.status === "published";

  function handleSubmit() {
    setError(null);
    const err = validateNumbers(numbers);
    if (err) {
      setError(err);
      return;
    }

    const body: {
      winningNumbers: string[];
      vietlottRef?: { drawPeriod: string; drawDate: string };
    } = {
      winningNumbers: numbers.map((n) => n.padStart(2, "0")),
    };

    if (vietlotPeriod.trim()) {
      body.vietlottRef = {
        drawPeriod: vietlotPeriod.trim(),
        drawDate: vietlotDate,
      };
    }

    publishResult.mutate(
      { drawId: draw.drawId, body },
      {
        onSuccess: () => {
          setOpen(false);
          setNumbers(Array(KENO_DRAW_COUNT).fill(""));
          setVietlotPeriod("");
          setVietlotDate(todayVN());
          setError(null);
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant={isRepublish ? "outline" : "default"}
          disabled={disabled || publishResult.isPending}
        >
          <Send className="mr-2 size-4" />
          {isRepublish ? "Sửa kết quả" : "Cập nhật kết quả"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isRepublish ? "Sửa kết quả" : "Cập nhật kết quả"} kỳ{" "}
            {draw.drawId}{" "}
            <span className="font-mono text-muted-foreground">
              · {formatVNTime(new Date(draw.drawTime))}
            </span>
          </DialogTitle>
          <DialogDescription>
            Nhập {KENO_DRAW_COUNT} số từ {String(KENO_NUMBER_MIN).padStart(2, "0")}–{String(KENO_NUMBER_MAX).padStart(2, "0")},
            không trùng.
            {isRepublish &&
              " Kết quả cũ sẽ bị ghi đè. Chỉ có hiệu lực trước khi kết sổ."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Section 1: Kết quả quay số */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex size-6 items-center justify-center rounded-md bg-violet-100 dark:bg-violet-900/50">
                <Hash className="size-3.5 text-violet-600 dark:text-violet-400" />
              </div>
              <Label className="text-sm font-semibold">Kết quả quay số</Label>
              <DevRandomFillButton
                onFill={() => {
                  const nums = generateUniqueRandomNumbers(
                    KENO_DRAW_COUNT,
                    KENO_NUMBER_MIN,
                    KENO_NUMBER_MAX
                  );
                  setNumbers(nums.map((n) => String(n).padStart(2, "0")));
                  setError(null);
                }}
              />
            </div>
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="mb-2.5 text-xs text-muted-foreground">
                {KENO_DRAW_COUNT} số trúng thưởng ({String(KENO_NUMBER_MIN).padStart(2, "0")}–
                {String(KENO_NUMBER_MAX).padStart(2, "0")})
              </p>
              <div className="grid grid-cols-10 gap-1.5">
                {numbers.map((val, idx) => (
                  <Input
                    key={idx}
                    type="text"
                    inputMode="numeric"
                    maxLength={2}
                    value={val}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                      const next = [...numbers];
                      next[idx] = v;
                      setNumbers(next);
                      setError(null);
                    }}
                    className="h-9 w-full p-1 text-center text-sm tabular-nums font-semibold font-mono"
                    placeholder={String(idx + 1).padStart(2, "0")}
                  />
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground/70">
                Đã điền {numbers.filter((n) => n.trim() !== "").length}/
                {KENO_DRAW_COUNT} số
              </p>
            </div>
          </div>

          <Separator />

          {/* Section 2: Vietlott Reference */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex size-6 items-center justify-center rounded-md bg-blue-100 dark:bg-blue-900/50">
                <ExternalLink className="size-3.5 text-blue-600 dark:text-blue-400" />
              </div>
              <Label className="text-sm font-semibold">
                Tham chiếu Vietlott
              </Label>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                Tùy chọn
              </span>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="mb-3 text-xs text-muted-foreground">
                Liên kết kỳ quay với dữ liệu Vietlott chính thức để đối soát
              </p>
              <div className="grid grid-cols-2 gap-4">
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
                    Mã kỳ quay Vietlott
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
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
              <p className="text-sm font-medium text-destructive">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
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
