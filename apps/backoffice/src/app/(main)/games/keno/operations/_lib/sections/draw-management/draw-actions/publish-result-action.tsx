"use client";

import { useState } from "react";
import { Check, Loader2, Dice5 } from "lucide-react";
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
import {
  DevRandomFillButton,
  generateUniqueRandomNumbers,
} from "@/components/dev-random-fill-button";
import { KENO_NUMBER_MIN, KENO_NUMBER_MAX, KENO_DRAW_COUNT } from "@megawin/game-keno/entities";
import { publishResultSchema } from "@megawin/game-keno/schemas";
import type { DrawSelectorItem } from "../../../use-operations";
import { usePublishResult } from "../../../use-operations";

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Dialog công bố kết quả kỳ quay Keno.
 *
 * Keno: nhập 20 số trúng (01-80), không có số đặc biệt, không có Vietlott ref.
 * Số được nhập theo thứ tự quay (thứ tự quan trọng cho UI hiển thị).
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

  // 20 inputs cho 20 số trúng
  const [numbers, setNumbers] = useState<string[]>(Array(KENO_DRAW_COUNT).fill(""));
  const [error, setError] = useState<string | null>(null);
  const publishResult = usePublishResult();

  function handleSubmit() {
    setError(null);
    // Dùng publishResultSchema (shared với API route) thay vì validate thủ công
    const result = publishResultSchema.safeParse({ winningNumbers: numbers });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Dữ liệu không hợp lệ.");
      return;
    }

    publishResult.mutate(
      {
        drawId: draw.drawId,
        body: {
          winningNumbers: numbers.map((n) => n.padStart(2, "0")),
        },
      },
      {
        onSuccess: () => {
          setIsOpen(false);
          setNumbers(Array(KENO_DRAW_COUNT).fill(""));
          setError(null);
        },
      },
    );
  }

  // Input 20 số theo hàng 5
  const rows: string[][] = [];
  for (let i = 0; i < KENO_DRAW_COUNT; i += 5) {
    rows.push(numbers.slice(i, i + 5));
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Công bố kết quả — Kỳ {String(draw.drawNo).padStart(3, "0")} · {draw.drawDate}{" "}
            {draw.drawTime}
          </DialogTitle>
          <DialogDescription>
            Nhập {KENO_DRAW_COUNT} số trúng ({pad2(KENO_NUMBER_MIN)}–{pad2(KENO_NUMBER_MAX)}). Thứ
            tự nhập là thứ tự quay chính thức.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex size-6 items-center justify-center rounded-md bg-orange-100 dark:bg-orange-900/50">
                <Dice5 className="size-3.5 text-orange-600 dark:text-orange-400" />
              </div>
              <Label className="text-sm font-semibold">20 số trúng (theo thứ tự quay)</Label>
              <DevRandomFillButton
                onFill={() => {
                  const drawn = generateUniqueRandomNumbers(
                    KENO_DRAW_COUNT,
                    KENO_NUMBER_MIN,
                    KENO_NUMBER_MAX,
                  );
                  setNumbers(drawn.map((n) => String(n).padStart(2, "0")));
                  setError(null);
                }}
              />
            </div>
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              {rows.map((row, rowIdx) => (
                <div key={rowIdx} className="flex gap-2">
                  {row.map((val, colIdx) => {
                    const idx = rowIdx * 5 + colIdx;
                    return (
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
                        className="w-14 text-center font-mono text-sm font-semibold tabular-nums"
                        placeholder={pad2(idx + 1)}
                      />
                    );
                  })}
                </div>
              ))}
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
