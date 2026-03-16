"use client";

/**
 * Bingo 18 – Create Draw Action Dialog
 *
 * Tạo batch kỳ quay Bingo 18.
 * Preview tự động tính từ thời điểm hiện tại, cross-day rollover nếu hết slot.
 * Staff chỉ cần nhập số kỳ → preview hiển thị lịch gợi ý → confirm tạo.
 */

import { useState } from "react";
import { Check, Loader2, CalendarPlus } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { useCreateDraw, usePreviewDraws } from "../../../use-operations";
import { todayVN, formatVNTime } from "@megawin/shared/utils/date";

interface CreateDrawActionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateDrawAction({ open, onOpenChange }: CreateDrawActionProps) {
  const [count, setCount] = useState(10);

  const preview = usePreviewDraws(open ? count : 0);
  const createDraw = useCreateDraw();

  const previewDraws = preview.data?.draws ?? [];

  function handleOpenChange(v: boolean) {
    if (!v) setCount(10);
    onOpenChange(v);
  }

  function handleCreate() {
    // Bingo18 CreateDraw API nhận drawDate + count.
    // Dùng today vì API validate drawDate === today.
    createDraw.mutate({ drawDate: todayVN(), count }, { onSuccess: () => handleOpenChange(false) });
  }

  // Nhóm preview theo ngày để hiển thị cross-day rollover
  const dateGroups = new Map<string, typeof previewDraws>();
  for (const d of previewDraws) {
    const date = d.drawDate ?? "unknown";
    const group = dateGroups.get(date) ?? [];
    group.push(d);
    dateGroups.set(date, group);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="size-4.5 text-amber-500" />
            Tạo kỳ quay Bingo 18
          </DialogTitle>
          <DialogDescription>
            Tạo batch kỳ quay. Lịch tự tính từ thời điểm hiện tại theo chu kỳ 6 phút. Nếu hết slot
            trong ngày sẽ tự chuyển sang ngày tiếp theo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
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
              {preview.isLoading && open && (
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
          </div>

          {/* Preview gợi ý */}
          {previewDraws.length > 0 && (
            <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Preview {previewDraws.length} kỳ
              </p>
              <div className="max-h-40 overflow-y-auto space-y-2">
                {[...dateGroups.entries()].map(([date, draws]) => (
                  <div key={date} className="space-y-0.5">
                    <p className="text-[10px] font-semibold text-muted-foreground">{date}</p>
                    {draws.slice(0, 5).map((d) => (
                      <div
                        key={`${date}-${d.drawNo}`}
                        className="flex items-center gap-2 text-xs pl-2"
                      >
                        <span className="font-mono text-muted-foreground w-8">#{d.drawNo}</span>
                        <span className="font-mono font-medium">
                          {formatVNTime(new Date(d.drawTime))}
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
                    {draws.length > 5 && (
                      <p className="text-[10px] text-muted-foreground pl-2">
                        +{draws.length - 5} kỳ tiếp theo...
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Huỷ bỏ
          </Button>
          <Button onClick={handleCreate} disabled={count < 1 || createDraw.isPending}>
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
