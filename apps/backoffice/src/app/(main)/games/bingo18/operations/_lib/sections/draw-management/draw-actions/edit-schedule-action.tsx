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
import { formatVNDate, formatVNTime, toVNDate } from "@megawin/shared/utils/date";

/** Chuyển ISO string → "yyyy-MM-dd" theo giờ VN */
function toVNDateStr(iso: string): string {
  return formatVNDate(new Date(iso));
}

/**
 * Dialog sửa lịch kỳ quay Bingo 18.
 *
 * Bingo 18: chu kỳ 6 phút — giờ đóng bán thường cách quay ~30 giây.
 * drawDate/drawTime là cặp độc lập — user tự điều chỉnh riêng biệt với salesClose.
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

  const [salesOpenDate, setSalesOpenDate] = useState(
    draw.salesOpenAt ? toVNDateStr(draw.salesOpenAt) : toVNDateStr(draw.salesCloseAt),
  );
  const [salesOpen, setSalesOpen] = useState(
    draw.salesOpenAt ? formatVNTime(new Date(draw.salesOpenAt)) : "",
  );
  const [salesCloseDate, setSalesCloseDate] = useState(toVNDateStr(draw.salesCloseAt));
  const [salesClose, setSalesClose] = useState(formatVNTime(new Date(draw.salesCloseAt)));
  const [drawDate, setDrawDate] = useState(toVNDateStr(draw.scheduledDrawAt));
  const [drawTimeVal, setDrawTimeVal] = useState(formatVNTime(new Date(draw.scheduledDrawAt)));
  const [error, setError] = useState<string | null>(null);

  // Reset về giá trị draw hiện tại mỗi khi dialog mở
  useEffect(() => {
    if (open) {
      const closeDate = toVNDateStr(draw.salesCloseAt);
      setSalesOpenDate(draw.salesOpenAt ? toVNDateStr(draw.salesOpenAt) : closeDate);
      setSalesOpen(draw.salesOpenAt ? formatVNTime(new Date(draw.salesOpenAt)) : "");
      setSalesCloseDate(closeDate);
      setSalesClose(formatVNTime(new Date(draw.salesCloseAt)));
      setDrawDate(toVNDateStr(draw.scheduledDrawAt));
      setDrawTimeVal(formatVNTime(new Date(draw.scheduledDrawAt)));
      setError(null);
    }
  }, [open, draw]);

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
      salesOpenAt: toVNDate(salesOpenDate, salesOpen).toISOString(),
      salesCloseAt: toVNDate(salesCloseDate, salesClose).toISOString(),
    };

    const originalDrawISO = draw.scheduledDrawAt;
    const newDrawISO = toVNDate(drawDate, drawTimeVal).toISOString();
    // Chỉ gửi drawTime khi thực sự thay đổi
    if (newDrawISO !== originalDrawISO) {
      body.drawTime = newDrawISO;
    }

    updateSchedule.mutate(
      { drawId: draw.drawId, body },
      { onSuccess: () => onOpenChange?.(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Sửa lịch — Kỳ {String(draw.drawNo).padStart(3, "0")} · {draw.drawDate} {draw.drawTime}
          </DialogTitle>
          <DialogDescription>
            Bingo 18 quay cố định mỗi 6 phút. Giờ đóng bán thường trước quay ~30 giây.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Mở bán */}
          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Giờ mở bán
            </Label>
            <div className="flex gap-2">
              <Input
                type="date"
                className="flex-1"
                value={salesOpenDate}
                onChange={(e) => {
                  setSalesOpenDate(e.target.value);
                  setError(null);
                }}
              />
              <Input
                type="time"
                className="w-28"
                value={salesOpen}
                onChange={(e) => {
                  setSalesOpen(e.target.value);
                  setError(null);
                }}
              />
            </div>
          </div>

          {/* Đóng bán */}
          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Giờ đóng bán
            </Label>
            <div className="flex gap-2">
              <Input
                type="date"
                className="flex-1"
                value={salesCloseDate}
                onChange={(e) => {
                  setSalesCloseDate(e.target.value);
                  setError(null);
                }}
              />
              <Input
                type="time"
                className="w-28"
                value={salesClose}
                onChange={(e) => {
                  setSalesClose(e.target.value);
                  setError(null);
                }}
              />
            </div>
          </div>

          {/* Quay số */}
          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Giờ quay số
            </Label>
            <div className="flex gap-2">
              <Input
                type="date"
                className="flex-1"
                value={drawDate}
                onChange={(e) => {
                  setDrawDate(e.target.value);
                  setError(null);
                }}
              />
              <Input
                type="time"
                className="w-28"
                value={drawTimeVal}
                onChange={(e) => {
                  setDrawTimeVal(e.target.value);
                  setError(null);
                }}
              />
            </div>
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
