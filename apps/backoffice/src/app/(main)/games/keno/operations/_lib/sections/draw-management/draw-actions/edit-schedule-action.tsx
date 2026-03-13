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
import { editScheduleSchema, type EditScheduleInput } from "@megawin/game-keno/schemas";
import type { DrawSelectorItem } from "../../../use-operations";
import { useUpdateSchedule } from "../../../use-operations";
import { formatVNDate, formatVNTime } from "@megawin/shared/utils/date";
import { toVNDate } from "@megawin/shared/utils/date";

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
 * Dialog sửa lịch kỳ quay Keno.
 *
 * Validation (editScheduleSchema):
 * - salesCloseAt > salesOpenAt
 * - drawAt ≥ salesCloseAt + 2 phút (Keno chu kỳ ngắn 8 phút)
 *
 * Form reset tự động khi dialog mở bằng useEffect + form.reset().
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
          <DialogTitle>
            Sửa lịch — Kỳ {String(draw.drawNo).padStart(3, "0")} · {draw.drawDate} {draw.drawTime}
          </DialogTitle>
          <DialogDescription>
            Giờ đóng bán phải trước giờ quay số ít nhất 2 phút (Keno chu kỳ ngắn ~8 phút).
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
              Keno quay cố định theo chu kỳ 8 phút. Chỉ sửa khi có lý do đặc biệt.
            </p>
          </div>

          {/* Root-level error (cross-field từ superRefine) */}
          {errors.root && (
            <p className="text-sm font-medium text-destructive">{errors.root.message}</p>
          )}

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
