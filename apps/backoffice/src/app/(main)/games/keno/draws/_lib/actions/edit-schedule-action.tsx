"use client";

import { useState } from "react";
import { Check, Edit3, Loader2 } from "lucide-react";
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
import type { KenoCurrentDrawInfo } from "../use-draws";
import { useKenoUpdateSchedule } from "../use-draws";
import { formatVNTime, toVNDate } from "@megawin/shared/utils";

export function EditScheduleAction({
  draw,
  disabled,
}: {
  draw: KenoCurrentDrawInfo;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [salesOpen, setSalesOpen] = useState(
    draw.sales.openAt ? formatVNTime(new Date(draw.sales.openAt)) : ""
  );
  const [salesClose, setSalesClose] = useState(
    formatVNTime(new Date(draw.sales.closeAt))
  );
  const [drawTimeVal, setDrawTimeVal] = useState(
    formatVNTime(new Date(draw.drawTime))
  );
  const [error, setError] = useState<string | null>(null);
  const updateSchedule = useKenoUpdateSchedule();

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
    if (salesClose >= drawTimeVal) {
      setError(`Giờ đóng bán phải nhỏ hơn giờ quay số (${drawTimeVal}).`);
      return;
    }

    const body: {
      salesOpenAt: string;
      salesCloseAt: string;
      drawTime?: string;
    } = {
      salesOpenAt: toVNDate(draw.drawDate, salesOpen).toISOString(),
      salesCloseAt: toVNDate(draw.drawDate, salesClose).toISOString(),
    };

    const originalDrawTime = formatVNTime(new Date(draw.drawTime));
    if (drawTimeVal !== originalDrawTime) {
      body.drawTime = toVNDate(draw.drawDate, drawTimeVal).toISOString();
    }

    updateSchedule.mutate(
      { drawId: draw.drawId, body },
      { onSuccess: () => setOpen(false) }
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || updateSchedule.isPending}
        >
          <Edit3 className="mr-2 size-4" />
          Sửa lịch
        </Button>
      </DialogTrigger>
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
              Hiếm khi thay đổi. Chỉ sửa nếu lịch quay chính thức thay đổi.
            </p>
          </div>
          {error && (
            <p className="text-sm font-medium text-destructive">{error}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Huỷ bỏ
          </Button>
          <Button onClick={handleSubmit} disabled={updateSchedule.isPending}>
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
