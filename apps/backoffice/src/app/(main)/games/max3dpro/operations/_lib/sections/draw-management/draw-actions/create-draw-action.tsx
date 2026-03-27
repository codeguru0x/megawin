"use client";

/**
 * Max 3D Pro – Create Draw Action Dialog
 *
 * Tạo nhiều kỳ quay Max 3D Pro liên tiếp.
 * Max 3D Pro khác Max 3D:
 * - Lịch quay: T3/T5/T7 lúc 18:00 (3 kỳ/tuần, 1 kỳ/ngày)
 * - Backend tự tính slot theo config — staff chỉ chọn số kỳ cần tạo (1-3)
 * - Preview hiển thị gợi ý ngày/giờ để staff tham khảo trước khi xác nhận
 * - Khi preview lỗi: hiển thị badge cảnh báo nhưng vẫn cho phép tạo
 * - Kỳ tạo xong đều ở trạng thái Scheduled — staff mở bán thủ công sau
 */

import { useState } from "react";
import { Check, Loader2, CalendarPlus, CalendarDays } from "lucide-react";
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
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { displayVNTime } from "@megawin/shared/utils";
import { useCreateDraw, usePreviewDraws } from "../../../use-operations";

// ─── Component ────────────────────────────────────────────────────────────────

interface CreateDrawActionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateDrawAction({ open, onOpenChange }: CreateDrawActionProps) {
  const [count, setCount] = useState(2);

  const preview = usePreviewDraws(open ? count : 0);
  const createDraw = useCreateDraw();

  function handleOpenChange(v: boolean) {
    if (!v) {
      setCount(2);
    }
    onOpenChange(v);
  }

  function handleCreate() {
    if (createDraw.isPending) return;
    createDraw.mutate({ count }, { onSuccess: () => handleOpenChange(false) });
  }

  // Rows để hiển thị preview từ API
  const previewRows = preview.data?.draws ?? [];
  // Placeholder khi preview chưa load hoặc lỗi
  const displayRows =
    previewRows.length > 0
      ? previewRows
      : Array.from({ length: count }, () => ({ drawDate: "", drawNo: 1, drawTime: "" }));

  const canSubmit = !createDraw.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="size-4.5 text-violet-500" />
            Tạo kỳ quay Max 3D Pro
          </DialogTitle>
          <DialogDescription>
            Tạo các kỳ quay tiếp theo. Max 3D Pro quay vào Thứ 3/5/7 lúc 18:00 — backend tự tính
            ngày và số thứ tự kỳ (drawNo) theo lịch cố định.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Row 1: Số kỳ + trạng thái preview */}
          <div className="flex items-end gap-4 flex-wrap">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Số kỳ tạo
              </Label>
              <Input
                type="number"
                min={1}
                max={3}
                value={count}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v) && v >= 1 && v <= 3) setCount(v);
                }}
                className="w-24 tabular-nums"
              />
            </div>

            <div className="flex flex-wrap gap-1.5 pb-0.5 items-center">
              {preview.isLoading && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  Đang lấy gợi ý...
                </span>
              )}
              {preview.isError && (
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                  Lỗi tải gợi ý — backend sẽ tự tính khi tạo
                </Badge>
              )}
              {!preview.isLoading && !preview.isError && preview.data && (
                <Badge variant="secondary" className="text-xs">
                  {preview.data.draws.length} kỳ khả dụng
                </Badge>
              )}
            </div>
          </div>

          {/* Bảng preview */}
          <div className="rounded-xl border overflow-hidden">
            {/* Header */}
            <div
              className="grid items-center gap-x-3 px-4 py-2 bg-muted/40 border-b"
              style={{ gridTemplateColumns: "1.5rem 1fr 7rem 5rem" }}
            >
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                #
              </span>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Ngày quay
              </span>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Giờ quay
              </span>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Kỳ số
              </span>
            </div>

            {/* Rows */}
            <div className="divide-y divide-border/50">
              {displayRows.map((row, i) => {
                const hasData = !!row.drawDate && !!row.drawTime;
                return (
                  <div
                    key={i}
                    className="grid items-center gap-x-3 px-4 py-2.5 hover:bg-muted/20"
                    style={{ gridTemplateColumns: "1.5rem 1fr 7rem 5rem" }}
                  >
                    <span
                      className={cn(
                        "tabular-nums text-xs font-semibold",
                        hasData ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {i + 1}
                    </span>

                    <span
                      className={cn(
                        "text-xs font-mono tabular-nums",
                        hasData ? "text-foreground" : "text-muted-foreground/50 italic",
                      )}
                    >
                      {row.drawDate
                        ? format(new Date(row.drawDate), "EEEE, dd/MM/yyyy", { locale: vi })
                        : "Đang tính..."}
                    </span>

                    <span
                      className={cn(
                        "text-xs font-mono tabular-nums",
                        hasData ? "text-foreground" : "text-muted-foreground/50 italic",
                      )}
                    >
                      {row.drawTime ? displayVNTime(new Date(row.drawTime)) : "—"}
                    </span>

                    <span className="text-xs font-mono tabular-nums text-muted-foreground">
                      {row.drawNo ? String(row.drawNo).padStart(3, "0") : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Thông tin về lịch + trạng thái sau tạo */}
          <div className="flex items-start gap-2 rounded-lg bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800 px-3 py-2.5">
            <CalendarDays className="size-3.5 text-violet-500 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-violet-700 dark:text-violet-300">
                Lịch quay T3, T5, T7 · 18:00
              </p>
              <p className="text-xs text-muted-foreground">
                Kỳ tạo xong ở trạng thái <strong>Chờ lịch</strong> — staff mở bán thủ công sau.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Huỷ bỏ
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!canSubmit}
            className={cn(!canSubmit && "opacity-50")}
          >
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
