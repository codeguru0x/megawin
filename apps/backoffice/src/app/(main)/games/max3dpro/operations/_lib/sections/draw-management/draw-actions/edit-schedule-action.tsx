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

/** Chuyển "DD/MM/YYYY" → "YYYY-MM-DD" cho HTML input[type=date] */
function vnDateToISO(vnDate: string): string {
  const [dd, mm, yyyy] = vnDate.split("/");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Dialog sửa lịch kỳ quay Max 3D Pro trên trang operations.
 *
 * Max 3D Pro: 1 kỳ/ngày lúc 18:00, T3/T5/T7 → drawDate cố định theo ngày.
 * drawDate/drawTime là cặp độc lập — user tự điều chỉnh riêng biệt với salesClose.
 * Validation: salesCloseAt > salesOpenAt > now; drawTime >= salesCloseAt.
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

  const isoDrawDate = vnDateToISO(draw.drawDate);

  const [salesOpenDate, setSalesOpenDate] = useState(
    draw.salesOpenAt ? formatVNDate(new Date(draw.salesOpenAt)) : isoDrawDate,
  );
  const [salesOpen, setSalesOpen] = useState(
    draw.salesOpenAt ? formatVNTime(new Date(draw.salesOpenAt)) : "",
  );
  const [salesCloseDate, setSalesCloseDate] = useState(
    draw.salesCloseAt ? formatVNDate(new Date(draw.salesCloseAt)) : isoDrawDate,
  );
  const [salesClose, setSalesClose] = useState(
    draw.salesCloseAt ? formatVNTime(new Date(draw.salesCloseAt)) : "",
  );
  const [drawDate, setDrawDate] = useState(isoDrawDate);
  const [drawTimeVal, setDrawTimeVal] = useState(draw.drawTime);
  const [error, setError] = useState<string | null>(null);

  // Reset form về giá trị draw hiện tại mỗi khi dialog mở
  useEffect(() => {
    if (open) {
      const isoDate = vnDateToISO(draw.drawDate);
      setSalesOpenDate(draw.salesOpenAt ? formatVNDate(new Date(draw.salesOpenAt)) : isoDate);
      setSalesOpen(draw.salesOpenAt ? formatVNTime(new Date(draw.salesOpenAt)) : "");
      setSalesCloseDate(draw.salesCloseAt ? formatVNDate(new Date(draw.salesCloseAt)) : isoDate);
      setSalesClose(draw.salesCloseAt ? formatVNTime(new Date(draw.salesCloseAt)) : "");
      setDrawDate(isoDate);
      setDrawTimeVal(draw.drawTime);
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
    if (salesClose <= salesOpen) {
      setError("Giờ đóng bán phải lớn hơn giờ mở bán.");
      return;
    }

    const body: { salesOpenAt: string; salesCloseAt: string; drawTime?: string } = {
      salesOpenAt: toVNDate(salesOpenDate, salesOpen).toISOString(),
      salesCloseAt: toVNDate(salesCloseDate, salesClose).toISOString(),
    };

    // So sánh với lịch quay gốc (draw.drawDate + draw.drawTime) để phát hiện thay đổi
    const originalIsoDate = vnDateToISO(draw.drawDate);
    // Chỉ gửi drawTime khi thực sự thay đổi
    if (drawTimeVal !== draw.drawTime || drawDate !== originalIsoDate) {
      body.drawTime = toVNDate(drawDate, drawTimeVal).toISOString();
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
          <DialogTitle>Sửa lịch kỳ {draw.drawId}</DialogTitle>
          <DialogDescription>
            Giờ đóng bán phải lớn hơn giờ mở bán và nhỏ hơn giờ quay số.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
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
              Mặc định 18:00, T3/T5/T7. Chỉ sửa nếu cần thiết.
            </p>
          </div>

          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange?.(false)}>
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
