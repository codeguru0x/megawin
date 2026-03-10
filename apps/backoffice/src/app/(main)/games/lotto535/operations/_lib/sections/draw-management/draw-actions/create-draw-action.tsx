"use client";

import { useState, useEffect } from "react";
import { Check, Loader2, CalendarPlus, Unlock, Lock } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { formatVN, formatVNTime } from "@megawin/shared/utils/date";

import { useCreateDraw, usePreviewDraws } from "../../../use-operations";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** "11-03" */
function fmtDate(iso: string) {
  return formatVN(new Date(iso), "dd-MM");
}

/** "13:00" */
function fmtTime(iso: string) {
  return formatVNTime(new Date(iso));
}

// ─── Component ────────────────────────────────────────────────────────────────

interface CreateDrawActionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateDrawAction({ open, onOpenChange }: CreateDrawActionProps) {
  const [count, setCount] = useState(2);
  // openSlots[i] = true nghĩa là kỳ ở slot i sẽ được mở bán ngay
  const [openSlots, setOpenSlots] = useState<boolean[]>([]);

  const preview = usePreviewDraws(open ? count : 0);
  const createDraw = useCreateDraw();

  const draws = preview.data?.draws ?? [];

  // Đồng bộ kích thước openSlots khi số kỳ preview thay đổi
  useEffect(() => {
    setOpenSlots((prev) => {
      if (prev.length === draws.length) return prev;
      // Giữ lại state cũ, extend với false cho các slot mới
      return Array.from({ length: draws.length }, (_, i) => prev[i] ?? false);
    });
  }, [draws.length]);

  const openCount = openSlots.filter(Boolean).length;
  const scheduledCount = draws.length - openCount;
  const uniqueDates = [...new Set(draws.map((d) => fmtDate(d.drawTime)))];

  function toggleSlot(i: number) {
    setOpenSlots((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  }

  function toggleAll() {
    const allOpen = openSlots.every(Boolean);
    setOpenSlots(openSlots.map(() => !allOpen));
  }

  function handleCreate() {
    const openSlotIndexes = openSlots.map((isOpen, i) => (isOpen ? i : -1)).filter((i) => i >= 0);

    createDraw.mutate(
      { count, openSlotIndexes },
      {
        onSuccess: () => {
          onOpenChange(false);
          setCount(2);
          setOpenSlots([]);
        },
      },
    );
  }

  function handleOpenChange(v: boolean) {
    if (!v) {
      setCount(2);
      setOpenSlots([]);
    }
    onOpenChange(v);
  }

  const allOpen = openSlots.length > 0 && openSlots.every(Boolean);
  const someOpen = openSlots.some(Boolean);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="size-4.5 text-emerald-500" />
            Tạo kỳ quay Lotto 5/35
          </DialogTitle>
          <DialogDescription>
            Tạo nhiều kỳ liên tiếp. Lịch quay và đóng bán tính tự động theo cấu hình game (2
            kỳ/ngày: 13h &amp; 21h).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Row 1: Số kỳ + summary badges */}
          <div className="flex items-end gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Số kỳ tạo
              </Label>
              <Input
                type="number"
                min={1}
                max={12}
                value={count}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v) && v >= 1 && v <= 12) setCount(v);
                }}
                className="w-24 tabular-nums"
              />
            </div>

            {draws.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pb-0.5">
                {uniqueDates.length > 1 && (
                  <Badge variant="outline" className="text-xs">
                    {uniqueDates.length} ngày
                  </Badge>
                )}
                {openCount > 0 && (
                  <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-xs">
                    {openCount} mở bán
                  </Badge>
                )}
                {scheduledCount > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {scheduledCount} chờ lịch
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Loading */}
          {preview.isLoading && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Đang tính lịch...
            </div>
          )}

          {!preview.isLoading && draws.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Không còn slot quay khả dụng.
            </p>
          )}

          {/* Preview table với per-row switch */}
          {draws.length > 0 && (
            <div className="rounded-xl border overflow-hidden">
              {/* Table header + toggle all */}
              <div
                className="grid items-center gap-x-2 px-3 py-2 bg-muted/40 border-b"
                style={{ gridTemplateColumns: "3.5rem 2.5rem 1fr 1fr auto" }}
              >
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  Ngày
                </span>
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  Kỳ
                </span>
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  Giờ quay
                </span>
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  Đóng bán
                </span>
                {/* Toggle all */}
                <button
                  onClick={toggleAll}
                  className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                  title={allOpen ? "Tắt tất cả" : "Mở bán tất cả"}
                >
                  {allOpen ? (
                    <Unlock className="size-3 text-emerald-600" />
                  ) : (
                    <Lock className="size-3" />
                  )}
                  <span className={cn(allOpen && "text-emerald-600 dark:text-emerald-400")}>
                    {allOpen ? "Đóng bán" : "Mở bán"}
                  </span>
                </button>
              </div>

              {/* Rows */}
              <div className="divide-y divide-border/50 max-h-64 overflow-y-auto">
                {draws.map((d, i) => {
                  const isOpen = openSlots[i] ?? false;
                  return (
                    <div
                      key={i}
                      className={cn(
                        "grid items-center gap-x-2 px-3 py-2.5 transition-colors",
                        isOpen ? "bg-emerald-50/50 dark:bg-emerald-950/15" : "hover:bg-muted/20",
                      )}
                      style={{ gridTemplateColumns: "3.5rem 2.5rem 1fr 1fr auto" }}
                    >
                      <span className="tabular-nums text-muted-foreground text-xs">
                        {fmtDate(d.drawTime)}
                      </span>
                      <span
                        className={cn(
                          "tabular-nums text-xs font-semibold",
                          isOpen ? "text-emerald-700 dark:text-emerald-300" : "text-foreground",
                        )}
                      >
                        Kỳ {d.drawNo}
                      </span>
                      <span className="tabular-nums text-xs font-mono">{fmtTime(d.drawTime)}</span>
                      <span className="tabular-nums text-xs font-mono text-muted-foreground">
                        {fmtTime(d.closeAt)}
                      </span>
                      {/* Per-row switch */}
                      <div className="flex items-center gap-1.5">
                        {isOpen ? (
                          <Unlock className="size-3 text-emerald-500 shrink-0" />
                        ) : (
                          <Lock className="size-3 text-muted-foreground/40 shrink-0" />
                        )}
                        <Switch
                          checked={isOpen}
                          onCheckedChange={() => toggleSlot(i)}
                          className="scale-75 origin-right"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Huỷ bỏ
          </Button>
          <Button
            onClick={handleCreate}
            disabled={draws.length === 0 || createDraw.isPending}
            className={cn(someOpen && "bg-emerald-600 hover:bg-emerald-700 text-white")}
          >
            {createDraw.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            Tạo {draws.length > 0 ? draws.length : count} kỳ
            {openCount > 0 ? ` · ${openCount} mở bán` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
