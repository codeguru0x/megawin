"use client";

/**
 * Max 3D – Create Draw Action Dialog
 *
 * Tạo nhiều kỳ quay Max 3D liên tiếp.
 * - Preview từ API gợi ý drawDate + drawTime theo lịch T2/T4/T6
 * - Staff có thể sửa drawDate và drawTime nếu cần
 * - Switch mở/đóng bán trên từng kỳ (mặc định: mở bán)
 * - Cột Thứ hiển thị trước cột ngày quay
 * - Không hiển thị thời gian đóng bán
 */

import { useEffect, useRef, useState } from "react";

import { MAX3D_CREATE_DRAW_BATCH_MAX } from "@megawin/game-max3d/schemas";
import {
  displayVNDate,
  displayVNTime,
  parseYMDToLocalDate,
  todayVNAsLocalDate,
  toVNIsoString,
  WEEKDAY_LABELS_ABBR,
  YMD_PATTERN,
} from "@megawin/shared/utils";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { CalendarIcon, CalendarPlus, Check, Loader2, Lock, RefreshCw, Unlock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import { useCreateDraw, usePreviewDraws } from "../../../use-operations";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DrawRow {
  /** Ngày quay, format "YYYY-MM-DD". */
  date: string;
  /** Giờ quay, format "HH:mm". */
  drawTime: string;
  /** Mở bán ngay khi tạo. Mặc định true. */
  isOpen: boolean;
}

function emptyRow(): DrawRow {
  return { date: "", drawTime: "", isOpen: true };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isRowComplete(row: DrawRow): boolean {
  return YMD_PATTERN.test(row.date) && /^\d{2}:\d{2}$/.test(row.drawTime);
}

/** T2/T4/T6 — thứ trong tuần viết tắt theo lịch Max 3D. */
function getWeekdayLabel(dateStr: string): string {
  const dt = parseYMDToLocalDate(dateStr);
  if (!dt) return "—";
  return WEEKDAY_LABELS_ABBR[dt.getDay()] ?? "";
}

// ─── DatePicker ───────────────────────────────────────────────────────────────

function DatePickerCell({
  value,
  onChange,
  hasError,
}: {
  value: string;
  onChange: (date: string) => void;
  hasError: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseYMDToLocalDate(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-8 w-full items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs tabular-nums transition-colors",
            "hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
            hasError
              ? "border-dashed border-amber-400 text-amber-600 dark:border-amber-500 dark:text-amber-400"
              : "border-input text-foreground",
          )}
        >
          <CalendarIcon className={cn("size-3.5 shrink-0", hasError ? "text-amber-400" : "text-muted-foreground")} />
          <span className={cn("flex-1 text-left font-mono", !value && "text-muted-foreground/60")}>
            {value || "Chọn ngày"}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" sideOffset={6}>
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(day) => {
            if (day) {
              onChange(format(day, "yyyy-MM-dd"));
              setOpen(false);
            }
          }}
          captionLayout="dropdown"
          locale={vi}
          startMonth={new Date(2025, 0)}
          endMonth={new Date(2030, 11)}
          // Chặn ngày quá khứ: ngày đã qua theo nghiệp vụ đã có kết quả, tạo kỳ mới là vô nghĩa
          // (server cũng chặn — đây chỉ là lớp UX để staff không phải thử-rồi-lỗi).
          disabled={{ before: todayVNAsLocalDate() }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}

// ─── TimePicker ───────────────────────────────────────────────────────────────

function TimePickerCell({
  value,
  onChange,
  hasError,
}: {
  value: string;
  onChange: (time: string) => void;
  hasError: boolean;
}) {
  return (
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-8 w-full rounded-md border bg-background px-2.5 text-xs font-mono tabular-nums",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 transition-colors",
        hasError
          ? "border-dashed border-amber-400 text-amber-600 dark:border-amber-500 dark:text-amber-400"
          : "border-input text-foreground",
      )}
    />
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface CreateDrawActionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateDrawAction({ open, onOpenChange }: CreateDrawActionProps) {
  const [count, setCount] = useState(3);
  const [rows, setRows] = useState<DrawRow[]>(() => Array.from({ length: 3 }, emptyRow));
  const lastPreviewCountRef = useRef<number>(0);

  const preview = usePreviewDraws(open ? count : 0);
  const createDraw = useCreateDraw();

  // Resize rows khi count thay đổi
  useEffect(() => {
    setRows((prev) => {
      if (prev.length === count) return prev;
      return Array.from({ length: count }, (_, i) => prev[i] ?? emptyRow());
    });
  }, [count]);

  // Fill từ preview (gợi ý) vào rows trống
  useEffect(() => {
    if (!preview.data) return;
    const previewDraws = preview.data.draws;
    if (previewDraws.length === 0) return;
    if (lastPreviewCountRef.current === count) return;
    lastPreviewCountRef.current = count;

    setRows((prev) =>
      prev.map((row, i) => {
        const p = previewDraws[i];
        if (!p) return row;
        const isEmpty = row.date === "" && row.drawTime === "";
        if (!isEmpty) return row;
        return {
          date: p.drawDate ?? displayVNDate(p.drawTime),
          drawTime: displayVNTime(p.drawTime),
          isOpen: row.isOpen,
        };
      }),
    );
  }, [preview.data, count]);

  function handleOpenChange(v: boolean) {
    if (!v) {
      setCount(3);
      setRows(Array.from({ length: 3 }, emptyRow));
      lastPreviewCountRef.current = 0;
    }
    onOpenChange(v);
  }

  function updateRow(i: number, patch: Partial<DrawRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function toggleSlot(i: number) {
    updateRow(i, { isOpen: !rows[i]!.isOpen });
  }

  function toggleAll() {
    const allOpen = rows.every((r) => r.isOpen);
    setRows((prev) => prev.map((r) => ({ ...r, isOpen: !allOpen })));
  }

  function applyPreview() {
    if (!preview.data) return;
    lastPreviewCountRef.current = 0;
    setRows((prev) =>
      prev.map((row, i) => {
        const p = preview.data!.draws[i];
        if (!p) return emptyRow();
        return {
          date: p.drawDate ?? displayVNDate(p.drawTime),
          drawTime: displayVNTime(p.drawTime),
          isOpen: row.isOpen,
        };
      }),
    );
    lastPreviewCountRef.current = count;
  }

  const openCount = rows.filter((r) => r.isOpen).length;
  const scheduledCount = rows.length - openCount;
  const completedRows = rows.filter(isRowComplete);
  const canSubmit = completedRows.length === rows.length && !createDraw.isPending;

  function handleCreate() {
    if (!canSubmit) return;
    createDraw.mutate(
      {
        draws: rows.map((row) => ({
          drawDate: row.date,
          drawTime: toVNIsoString(row.date, row.drawTime),
          openNow: row.isOpen,
        })),
      },
      { onSuccess: () => handleOpenChange(false) },
    );
  }

  const allOpen = rows.length > 0 && rows.every((r) => r.isOpen);
  const someOpen = rows.some((r) => r.isOpen);
  const previewCount = preview.data?.draws.length ?? 0;
  const hasFewerPreviewSlots = !preview.isLoading && open && previewCount < count;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="size-4.5 text-blue-500" />
            Tạo kỳ quay Max 3D
          </DialogTitle>
          <DialogDescription>
            Tạo nhiều kỳ liên tiếp. Lịch gợi ý theo T2/T4/T6 lúc 18:00 — staff có thể chỉnh ngày và giờ nếu cần.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Row 1: Số kỳ + badges */}
          <div className="flex items-end gap-4 flex-wrap">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Số kỳ mở</Label>
              <Input
                type="number"
                min={1}
                max={MAX3D_CREATE_DRAW_BATCH_MAX}
                value={count}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v) && v >= 1 && v <= MAX3D_CREATE_DRAW_BATCH_MAX) setCount(v);
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
              {openCount > 0 && (
                <Badge className="bg-green-600 hover:bg-green-600 text-white text-xs">{openCount} mở bán</Badge>
              )}
              {scheduledCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {scheduledCount} chờ lịch
                </Badge>
              )}
              {preview.data && preview.data.draws.length > 0 && (
                <button
                  type="button"
                  onClick={applyPreview}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  title="Áp lại gợi ý từ preview"
                >
                  <RefreshCw className="size-3" />
                </button>
              )}
              {hasFewerPreviewSlots && (
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                  Gợi ý chỉ có {previewCount}/{count} kỳ — tự điền các ô trống
                </Badge>
              )}
              {preview.isError && (
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                  Lỗi tải gợi ý — tự điền các ô bên dưới
                </Badge>
              )}
            </div>
          </div>

          {/* Bảng nhập liệu */}
          <div className="rounded-xl border overflow-hidden">
            {/* Header */}
            <div
              className="grid items-center gap-x-3 px-4 py-2 bg-muted/40 border-b"
              style={{ gridTemplateColumns: "1.5rem 3rem 1fr 6.5rem 9rem" }}
            >
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">#</span>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-center">
                Thứ
              </span>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Ngày quay</span>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Giờ quay</span>
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={toggleAll}
                  className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  {allOpen ? <Unlock className="size-3 text-green-600" /> : <Lock className="size-3" />}
                  <span className={cn(allOpen && "text-green-600 dark:text-green-400")}>{allOpen ? "Đóng" : "Mở"}</span>
                </button>
              </div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-border/50">
              {rows.map((row, i) => {
                const complete = isRowComplete(row);
                const dateErr = !row.date;
                const timeErr = !row.drawTime;
                const weekday = getWeekdayLabel(row.date);

                return (
                  <div
                    key={i}
                    className={cn(
                      "grid items-center gap-x-3 px-4 py-2.5 transition-colors",
                      row.isOpen ? "bg-green-50/50 dark:bg-green-950/15" : "hover:bg-muted/20",
                    )}
                    style={{ gridTemplateColumns: "1.5rem 3rem 1fr 6.5rem 9rem" }}
                  >
                    {/* # */}
                    <span
                      className={cn(
                        "tabular-nums text-xs font-semibold",
                        row.isOpen
                          ? "text-green-700 dark:text-green-300"
                          : complete
                            ? "text-foreground"
                            : "text-muted-foreground",
                      )}
                    >
                      {i + 1}
                    </span>

                    {/* Thứ */}
                    <span
                      className={cn(
                        "text-xs font-semibold tabular-nums text-center",
                        row.date
                          ? row.isOpen
                            ? "text-green-700 dark:text-green-300"
                            : "text-foreground"
                          : "text-muted-foreground/50",
                      )}
                    >
                      {weekday}
                    </span>

                    {/* Ngày quay */}
                    <DatePickerCell value={row.date} onChange={(date) => updateRow(i, { date })} hasError={dateErr} />

                    {/* Giờ quay */}
                    <TimePickerCell
                      value={row.drawTime}
                      onChange={(drawTime) => updateRow(i, { drawTime })}
                      hasError={timeErr}
                    />

                    {/* Switch mở/đóng bán */}
                    {/* Click vào label toggle switch — Switch có pointer-events-none để label nhận click thay. */}
                    <label
                      htmlFor={`max3d-slot-toggle-${i}`}
                      className="flex items-center justify-end gap-1.5 cursor-pointer select-none"
                    >
                      {row.isOpen ? (
                        <Unlock className="size-3 text-green-500 shrink-0" />
                      ) : (
                        <Lock className="size-3 text-muted-foreground/40 shrink-0" />
                      )}
                      <Switch
                        id={`max3d-slot-toggle-${i}`}
                        checked={row.isOpen}
                        onCheckedChange={() => toggleSlot(i)}
                        className="scale-75 origin-right pointer-events-none"
                      />
                      <span
                        className={cn(
                          "text-[11px] font-medium min-w-12 text-left",
                          row.isOpen ? "text-green-600 dark:text-green-400" : "text-muted-foreground",
                        )}
                      >
                        {row.isOpen ? "Mở bán" : "Chờ lịch"}
                      </span>
                    </label>
                  </div>
                );
              })}
            </div>
          </div>

          {completedRows.length < rows.length && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {rows.length - completedRows.length} kỳ chưa đủ thông tin (ngày + giờ quay).
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Huỷ bỏ
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!canSubmit}
            className={cn(someOpen && "bg-green-600 hover:bg-green-700 text-white")}
          >
            {createDraw.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Tạo {count} kỳ{openCount > 0 ? ` · ${openCount} mở bán` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
