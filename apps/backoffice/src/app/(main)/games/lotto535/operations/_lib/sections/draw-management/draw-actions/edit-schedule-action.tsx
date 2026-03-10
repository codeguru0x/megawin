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
import { toVNDate, formatVNDate, formatVNTime } from "@megawin/shared/utils/date";

/** Parse ISO string → { date: "yyyy-MM-dd", time: "HH:mm" } theo giờ VN */
function parseISOToVN(iso: string | undefined): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { date: "", time: "" };
  return {
    date: formatVNDate(d),
    time: formatVNTime(d),
  };
}

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
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open !== undefined ? open : internalOpen;
  const setIsOpen = onOpenChange ?? setInternalOpen;

  const [salesOpenDate, setSalesOpenDate] = useState("");
  const [salesOpenTime, setSalesOpenTime] = useState("");
  const [salesCloseDate, setSalesCloseDate] = useState("");
  const [salesCloseTime, setSalesCloseTime] = useState("");
  const [drawDate, setDrawDate] = useState("");
  const [drawTime, setDrawTime] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset form với dữ liệu mới nhất từ draw mỗi khi dialog mở
  useEffect(() => {
    if (!isOpen) return;
    const op = parseISOToVN(draw.salesOpenAt);
    const cl = parseISOToVN(draw.salesCloseAt);
    const dr = parseISOToVN(draw.drawResultAt);
    setSalesOpenDate(op.date);
    setSalesOpenTime(op.time);
    setSalesCloseDate(cl.date);
    setSalesCloseTime(cl.time);
    setDrawDate(dr.date);
    setDrawTime(dr.time);
    setError(null);
  }, [isOpen, draw.salesOpenAt, draw.salesCloseAt, draw.drawResultAt]);

  const updateSchedule = useUpdateSchedule();

  function handleSubmit() {
    setError(null);

    if (!salesOpenDate || !salesOpenTime) {
      setError("Vui lòng nhập đầy đủ ngày và giờ mở bán.");
      return;
    }
    if (!salesCloseDate || !salesCloseTime) {
      setError("Vui lòng nhập đầy đủ ngày và giờ đóng bán.");
      return;
    }
    if (!drawDate || !drawTime) {
      setError("Vui lòng nhập đầy đủ ngày và giờ quay số.");
      return;
    }

    const openISO = toVNDate(salesOpenDate, salesOpenTime).toISOString();
    const closeISO = toVNDate(salesCloseDate, salesCloseTime).toISOString();
    const drawISO = toVNDate(drawDate, drawTime).toISOString();

    if (closeISO <= openISO) {
      setError("Giờ đóng bán phải lớn hơn giờ mở bán.");
      return;
    }
    if (closeISO >= drawISO) {
      setError(`Giờ đóng bán phải nhỏ hơn giờ quay số (${drawTime}).`);
      return;
    }

    const originalDrawISO = draw.drawResultAt ?? "";
    const body: { salesOpenAt: string; salesCloseAt: string; drawTime?: string } = {
      salesOpenAt: openISO,
      salesCloseAt: closeISO,
    };
    if (drawISO !== originalDrawISO) {
      body.drawTime = drawISO;
    }

    updateSchedule.mutate({ drawId: draw.drawId, body }, { onSuccess: () => setIsOpen(false) });
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sửa lịch kỳ {draw.drawId}</DialogTitle>
          <DialogDescription>
            Giờ đóng bán phải lớn hơn giờ mở bán và nhỏ hơn giờ quay số.
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
                value={salesOpenTime}
                onChange={(e) => {
                  setSalesOpenTime(e.target.value);
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
                value={salesCloseTime}
                onChange={(e) => {
                  setSalesCloseTime(e.target.value);
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
                value={drawTime}
                onChange={(e) => {
                  setDrawTime(e.target.value);
                  setError(null);
                }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground/70">
              Hiếm khi thay đổi. Chỉ sửa nếu lịch quay chính thức thay đổi.
            </p>
          </div>

          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
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
