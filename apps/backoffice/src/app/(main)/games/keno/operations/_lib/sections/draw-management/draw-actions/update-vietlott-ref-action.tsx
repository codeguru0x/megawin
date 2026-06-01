"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Link as LinkIcon, CalendarDays, Hash } from "lucide-react";
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
import { todayVN } from "@megawin/shared/utils";
import type { DrawSelectorItem } from "../../../use-operations";
import { useUpdateVietlottRef } from "../../../use-operations";

export interface VietlottRefValues {
  drawPeriod: string;
  drawDate: string;
}

/**
 * Dialog sửa CHỈ tham chiếu Vietlott (`drawPeriod` + `drawDate`).
 *
 * Backend endpoint riêng `POST /keno/draws/{drawId}/vietlott-ref` — cập nhật
 * metadata tham chiếu KHÔNG kéo theo resettle. Dùng khi staff phát hiện gõ
 * sai mã kỳ Vietlott hoặc ngày sau khi đã publish (`Published`/`Settling`/`Settled`).
 */
export function UpdateVietlottRefAction({
  draw,
  open,
  onOpenChange,
  currentValues,
}: {
  draw: DrawSelectorItem;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  currentValues?: VietlottRefValues;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open !== undefined ? open : internalOpen;
  const setIsOpen = onOpenChange ?? setInternalOpen;

  const mutation = useUpdateVietlottRef();

  const [drawPeriod, setDrawPeriod] = useState(currentValues?.drawPeriod ?? "");
  const [drawDate, setDrawDate] = useState(currentValues?.drawDate ?? todayVN());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDrawPeriod(currentValues?.drawPeriod ?? "");
      setDrawDate(currentValues?.drawDate ?? todayVN());
      setError(null);
    }
  }, [isOpen, currentValues]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const period = drawPeriod.trim();
    if (!period) {
      setError("Mã kỳ Vietlott không được để trống.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(drawDate)) {
      setError("Ngày Vietlott phải đúng định dạng YYYY-MM-DD.");
      return;
    }

    mutation.mutate(
      {
        drawId: draw.drawId,
        body: { drawPeriod: period, drawDate },
      },
      { onSuccess: () => setIsOpen(false) },
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LinkIcon className="size-4.5 text-blue-500" />
            Sửa tham chiếu Vietlott
          </DialogTitle>
          <DialogDescription className="text-xs"></DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-3 py-2">
            <div className="space-y-1.5">
              <Label
                htmlFor="vietlott-period"
                className="text-xs text-muted-foreground flex items-center gap-1.5"
              >
                <Hash className="size-3" /> Mã kỳ Vietlott
              </Label>
              <Input
                id="vietlott-period"
                value={drawPeriod}
                onChange={(e) => setDrawPeriod(e.target.value)}
                placeholder="VD: 123456"
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="vietlott-date"
                className="text-xs text-muted-foreground flex items-center gap-1.5"
              >
                <CalendarDays className="size-3" /> Ngày Vietlott
              </Label>
              <Input
                id="vietlott-date"
                type="date"
                value={drawDate}
                onChange={(e) => setDrawDate(e.target.value)}
                className="font-mono text-sm"
              />
            </div>

            {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
              Huỷ bỏ
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Check className="mr-2 size-4" />
              )}
              Lưu
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
