"use client";

import { useState, useEffect } from "react";
import { Check, Loader2 } from "lucide-react";
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
import type { DrawSelectorItem } from "../../../use-operations";
import { useUpdateSchedule } from "../../../use-operations";
import { formatVNTime, toVNDate } from "@megawin/shared/utils/date";

/**
 * Dialog sửa lịch kỳ quay Bingo 18.
 *
 * Bingo 18: chu kỳ 6 phút — giờ đóng bán thường cách quay ~30 giây.
 * Form reset tự động khi dialog mở.
 */
export function EditScheduleAction({
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
  const updateSchedule = useUpdateSchedule();

  const [salesOpen, setSalesOpen] = useState(
    draw.salesOpenAt ? formatVNTime(new Date(draw.salesOpenAt)) : "",
  );
  const [salesClose, setSalesClose] = useState(formatVNTime(new Date(draw.salesCloseAt)));
  const [drawTimeVal, setDrawTimeVal] = useState(formatVNTime(new Date(draw.scheduledDrawAt)));
  const [error, setError] = useState<string | null>(null);

  // Reset về giá trị draw hiện tại mỗi khi dialog mở
  useEffect(() => {
    if (open) {
      setSalesOpen(draw.salesOpenAt ? formatVNTime(new Date(draw.salesOpenAt)) : "");
      setSalesClose(formatVNTime(new Date(draw.salesCloseAt)));
      setDrawTimeVal(formatVNTime(new Date(draw.scheduledDrawAt)));
      setError(null);
    }
  }, [open, draw]);

  // Lấy drawDate từ salesCloseAt để build ISO
  const drawDate = new Date(draw.salesCloseAt).toISOString().split("T")[0]!;

  function handleSubmit() {
    setError(null);
    if (!salesOpen || !salesClose) {
      setError("Vui lòng nhập đầy đủ giờ mở và đóng bán.");
      return;
    }
    if (!drawTimeVal) {
      setError("Vui lòng nhập giờ quay số.");
      return;
    }

    const body: { salesOpenAt: string; salesCloseAt: string; drawTime?: string } = {
      salesOpenAt: toVNDate(drawDate, salesOpen).toISOString(),
      salesCloseAt: toVNDate(drawDate, salesClose).toISOString(),
    };

    const originalDrawTime = formatVNTime(new Date(draw.scheduledDrawAt));
    if (drawTimeVal !== originalDrawTime) {
      body.drawTime = toVNDate(drawDate, drawTimeVal).toISOString();
    }

    updateSchedule.mutate(
      { drawId: draw.drawId, body },
      { onSuccess: () => onOpenChange?.(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            Sửa lịch — Kỳ {String(draw.drawNo).padStart(3, "0")} · {draw.drawDate} {draw.drawTime}
          </DialogTitle>
          <DialogDescription>
            Bingo 18 quay cố định mỗi 6 phút. Giờ đóng bán thường trước quay ~30 giây.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Giờ mở bán
            </Label>
            <Input
              type="time"
              value={salesOpen}
              onChange={(e) => {
                setSalesOpen(e.target.value);
                setError(null);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Giờ đóng bán
            </Label>
            <Input
              type="time"
              value={salesClose}
              onChange={(e) => {
                setSalesClose(e.target.value);
                setError(null);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Giờ quay số
            </Label>
            <Input
              type="time"
              value={drawTimeVal}
              onChange={(e) => {
                setDrawTimeVal(e.target.value);
                setError(null);
              }}
            />
            <p className="text-[11px] text-muted-foreground/70">
              Bingo 18 quay cố định mỗi 6 phút. Chỉ sửa khi có lý do đặc biệt.
            </p>
          </div>

          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange?.(false)}>
            Huỷ bỏ
          </Button>
          <Button onClick={handleSubmit} disabled={updateSchedule.isPending || disabled}>
            {updateSchedule.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Check className="mr-2 size-4" />
            )}
            Lưu thay đổi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
