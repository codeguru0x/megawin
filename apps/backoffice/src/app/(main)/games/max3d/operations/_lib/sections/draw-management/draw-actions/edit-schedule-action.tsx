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
 * Dialog sửa lịch kỳ quay Max 3D trên trang operations.
 *
 * Max 3D: 1 kỳ/ngày lúc 18:00, T2/T4/T6 → drawDate cố định theo ngày.
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
  const [salesOpen, setSalesOpen] = useState("");
  const [salesClose, setSalesClose] = useState("");
  const [drawTimeVal, setDrawTimeVal] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset form về giá trị draw hiện tại mỗi khi dialog mở
  useEffect(() => {
    if (open) {
      setSalesOpen(draw.salesOpenAt ? formatVNTime(new Date(draw.salesOpenAt)) : "");
      setSalesClose(formatVNTime(new Date(draw.salesCloseAt)));
      setDrawTimeVal(draw.drawResultAt ? formatVNTime(new Date(draw.drawResultAt)) : draw.drawTime);
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

    // drawDate từ selector có format DD/MM/YYYY → cần chuyển sang YYYY-MM-DD cho toVNDate
    const [dd, mm, yyyy] = draw.drawDate.split("/");
    const isoDate = `${yyyy}-${mm}-${dd}`;

    const body: { salesOpenAt: string; salesCloseAt: string; drawTime?: string } = {
      salesOpenAt: toVNDate(isoDate, salesOpen).toISOString(),
      salesCloseAt: toVNDate(isoDate, salesClose).toISOString(),
    };

    const originalDrawTime = draw.drawResultAt
      ? formatVNTime(new Date(draw.drawResultAt))
      : draw.drawTime;
    if (drawTimeVal !== originalDrawTime) {
      body.drawTime = toVNDate(isoDate, drawTimeVal).toISOString();
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
          <DialogTitle>Sửa lịch kỳ {draw.drawId}</DialogTitle>
          <DialogDescription>
            Giờ đóng bán phải lớn hơn giờ mở bán và nhỏ hơn giờ quay số.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
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
              Mặc định 18:00, T2/T4/T6. Chỉ sửa nếu cần thiết.
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
