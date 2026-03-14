"use client";

/**
 * Bingo 18 – Create Draw Action Dialog
 *
 * Tạo batch kỳ quay Bingo 18 theo ngày + số lượng.
 * Bingo 18: chu kỳ 6 phút (06:00-21:54), ~160 kỳ/ngày.
 * API tự tính drawTime và closeAt theo config game.
 */

import { useState } from "react";
import { Check, Loader2, CalendarPlus, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
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
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useCreateDraw, usePreviewDraws } from "../../../use-operations";
import { todayVN } from "@megawin/shared/utils/date";

interface CreateDrawActionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateDrawAction({ open, onOpenChange }: CreateDrawActionProps) {
  const [drawDate, setDrawDate] = useState(todayVN());
  const [count, setCount] = useState(10);

  const preview = usePreviewDraws(open ? drawDate : "", open ? count : 0);
  const createDraw = useCreateDraw();

  const previewDraws = preview.data?.draws ?? [];

  function handleOpenChange(v: boolean) {
    if (!v) {
      setDrawDate(todayVN());
      setCount(10);
    }
    onOpenChange(v);
  }

  function handleCreate() {
    createDraw.mutate({ drawDate, count }, { onSuccess: () => handleOpenChange(false) });
  }

  const selectedDate = drawDate
    ? (() => {
        const [y, m, d] = drawDate.split("-").map(Number);
        return new Date(y!, m! - 1, d!);
      })()
    : undefined;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="size-4.5 text-amber-500" />
            Tạo kỳ quay Bingo 18
          </DialogTitle>
          <DialogDescription>
            Tạo batch kỳ quay theo ngày. API tự tính giờ theo chu kỳ 6 phút.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Ngày quay */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Ngày quay
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex h-9 w-full items-center gap-2 rounded-md border bg-background px-3 text-sm transition-colors hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 border-input"
                >
                  <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span
                    className={cn(
                      "flex-1 text-left font-mono",
                      !drawDate && "text-muted-foreground/60",
                    )}
                  >
                    {drawDate || "Chọn ngày"}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start" sideOffset={6}>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(day) => {
                    if (day) setDrawDate(format(day, "yyyy-MM-dd"));
                  }}
                  captionLayout="dropdown"
                  locale={vi}
                  startMonth={new Date(2025, 0)}
                  endMonth={new Date(2030, 11)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Số kỳ */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Số kỳ tạo
            </Label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={1}
                max={30}
                value={count}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v) && v >= 1 && v <= 30) setCount(v);
                }}
                className="w-28 tabular-nums"
              />
              {preview.isLoading && open && drawDate && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  Đang tính lịch...
                </span>
              )}
              {previewDraws.length > 0 && !preview.isLoading && (
                <Badge variant="secondary" className="text-xs">
                  {previewDraws.length} kỳ gợi ý
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground/70">
              API sẽ tạo {count} kỳ liên tiếp bắt đầu từ kỳ tiếp theo của ngày{" "}
              {drawDate || "đã chọn"}.
            </p>
          </div>

          {/* Preview gợi ý */}
          {previewDraws.length > 0 && (
            <div className="rounded-lg border bg-muted/20 p-3 space-y-1.5">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Preview {previewDraws.length} kỳ đầu
              </p>
              <div className="max-h-32 overflow-y-auto space-y-0.5">
                {previewDraws.slice(0, 5).map((d) => (
                  <div key={d.drawNo} className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-muted-foreground w-8">#{d.drawNo}</span>
                    <span className="font-mono font-medium">
                      {new Date(d.drawTime).toLocaleTimeString("vi-VN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "Asia/Ho_Chi_Minh",
                      })}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "h-4 px-1.5 text-[10px]",
                        d.status === "salesOpen"
                          ? "text-green-600 border-green-300"
                          : "text-slate-500",
                      )}
                    >
                      {d.status === "salesOpen" ? "Mở bán" : "Chờ lịch"}
                    </Badge>
                  </div>
                ))}
                {previewDraws.length > 5 && (
                  <p className="text-[10px] text-muted-foreground">
                    +{previewDraws.length - 5} kỳ tiếp theo...
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Huỷ bỏ
          </Button>
          <Button onClick={handleCreate} disabled={!drawDate || count < 1 || createDraw.isPending}>
            {createDraw.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            Tạo {count} kỳ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
