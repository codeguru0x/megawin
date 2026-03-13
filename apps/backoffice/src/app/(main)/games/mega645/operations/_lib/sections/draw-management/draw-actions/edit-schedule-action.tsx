"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { editScheduleSchema, type EditScheduleInput } from "@megawin/game-mega645/schemas";
import type { DrawSelectorItem } from "../../../use-operations";
import { useUpdateSchedule } from "../../../use-operations";
import { toVNDate, formatVNDate, formatVNTime } from "@megawin/shared/utils/date";

/** Parse ISO string → { date: "yyyy-MM-dd", time: "HH:mm" } theo giờ VN */
function parseISOToVN(iso: string | undefined): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { date: "", time: "" };
  return { date: formatVNDate(d), time: formatVNTime(d) };
}

function buildDefaultValues(draw: DrawSelectorItem): EditScheduleInput {
  const op = parseISOToVN(draw.salesOpenAt);
  const cl = parseISOToVN(draw.salesCloseAt);
  const dr = parseISOToVN(draw.drawResultAt);
  return {
    salesOpenDate: op.date,
    salesOpenTime: op.time,
    salesCloseDate: cl.date,
    salesCloseTime: cl.time,
    drawDate: dr.date,
    drawTime: dr.time,
  };
}

/**
 * Dialog sửa lịch kỳ quay Mega 6/45.
 *
 * Validation (editScheduleSchema):
 * - salesCloseAt > salesOpenAt
 * - drawAt > salesCloseAt
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

  const form = useForm<EditScheduleInput>({
    resolver: zodResolver(editScheduleSchema),
    defaultValues: buildDefaultValues(draw),
  });

  // Reset form về giá trị draw hiện tại mỗi khi dialog mở
  useEffect(() => {
    if (open) {
      form.reset(buildDefaultValues(draw));
    }
  }, [open, draw, form]);

  function handleSubmit(data: EditScheduleInput) {
    const openISO = toVNDate(data.salesOpenDate, data.salesOpenTime).toISOString();
    const closeISO = toVNDate(data.salesCloseDate, data.salesCloseTime).toISOString();
    const drawISO = toVNDate(data.drawDate, data.drawTime).toISOString();

    const originalDrawISO = draw.drawResultAt ?? "";
    const body: { salesOpenAt: string; salesCloseAt: string; drawTime?: string } = {
      salesOpenAt: openISO,
      salesCloseAt: closeISO,
    };
    // Chỉ gửi drawTime khi thực sự thay đổi
    if (drawISO !== originalDrawISO) {
      body.drawTime = drawISO;
    }

    updateSchedule.mutate(
      { drawId: draw.drawId, body },
      { onSuccess: () => onOpenChange?.(false) },
    );
  }

  const {
    register,
    handleSubmit: rhfSubmit,
    formState: { errors },
  } = form;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          {/* Mega 6/45 dùng drawDate (ngày) thay vì drawNo */}
          <DialogTitle>Sửa lịch kỳ {draw.drawDate}</DialogTitle>
          <DialogDescription>
            Giờ đóng bán phải lớn hơn giờ mở bán và nhỏ hơn giờ quay số.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={rhfSubmit(handleSubmit)} className="space-y-4 py-2">
          {/* Mở bán */}
          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Giờ mở bán
            </Label>
            <div className="flex gap-2">
              <Input type="date" className="flex-1" {...register("salesOpenDate")} />
              <Input type="time" className="w-28" {...register("salesOpenTime")} />
            </div>
            {(errors.salesOpenDate ?? errors.salesOpenTime) && (
              <p className="text-sm font-medium text-destructive">
                {errors.salesOpenDate?.message ?? errors.salesOpenTime?.message}
              </p>
            )}
          </div>

          {/* Đóng bán */}
          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Giờ đóng bán
            </Label>
            <div className="flex gap-2">
              <Input type="date" className="flex-1" {...register("salesCloseDate")} />
              <Input type="time" className="w-28" {...register("salesCloseTime")} />
            </div>
            {(errors.salesCloseDate ?? errors.salesCloseTime) && (
              <p className="text-sm font-medium text-destructive">
                {errors.salesCloseDate?.message ?? errors.salesCloseTime?.message}
              </p>
            )}
          </div>

          {/* Quay số */}
          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Giờ quay số
            </Label>
            <div className="flex gap-2">
              <Input type="date" className="flex-1" {...register("drawDate")} />
              <Input type="time" className="w-28" {...register("drawTime")} />
            </div>
            {(errors.drawDate ?? errors.drawTime) && (
              <p className="text-sm font-medium text-destructive">
                {errors.drawDate?.message ?? errors.drawTime?.message}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground/70">
              Hiếm khi thay đổi. Chỉ sửa nếu lịch quay chính thức thay đổi.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange?.(false)}>
              Huỷ bỏ
            </Button>
            <Button type="submit" disabled={updateSchedule.isPending || disabled}>
              {updateSchedule.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Check className="mr-2 size-4" />
              )}
              Lưu thay đổi
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
