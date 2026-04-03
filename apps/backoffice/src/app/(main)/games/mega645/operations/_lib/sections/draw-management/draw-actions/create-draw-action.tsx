"use client";

import { useState, useEffect, useRef } from "react";
import { Check, Loader2, CalendarPlus, Unlock, Lock, RefreshCw, CalendarIcon } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatVNTime, formatVNDate } from "@megawin/shared/utils";
import { useCreateDraw, usePreviewDraws } from "../../../use-operations";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DrawRow {
  /** Ngày quay, format "YYYY-MM-DD". */
  date: string;
  /** Số thứ tự kỳ trong năm (do preview API cung cấp). 0 = chưa xác định. */
  drawNo: number;
  /** Giờ quay, format "HH:mm". */
  drawTime: string;
  /** Mở bán ngay khi tạo. */
  isOpen: boolean;
}

function emptyRow(): DrawRow {
  return { date: "", drawNo: 0, drawTime: "", isOpen: false };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDisplayTime(iso: string): string {
  return formatVNTime(new Date(iso));
}

function fmtStoreDate(iso: string): string {
  return formatVNDate(new Date(iso));
}

function buildIso(date: string, time: string): string {
  return `${date}T${time}:00+07:00`;
}

function isRowComplete(row: DrawRow): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(row.date) && /^\d{2}:\d{2}$/.test(row.drawTime) && row.drawNo > 0
  );
}

function parseDateStr(dateStr: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return undefined;
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y!, m! - 1, d!);
  return isNaN(dt.getTime()) ? undefined : dt;
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
  const selected = parseDateStr(value);

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
          <CalendarIcon
            className={cn(
              "size-3.5 shrink-0",
              hasError ? "text-amber-400" : "text-muted-foreground",
            )}
          />
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
          initialFocus
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

/**
 * Dialog tạo kỳ quay Mega 6/45.
 *
 * Mega 6/45: 1 kỳ/ngày (không có drawNo), giờ quay cố định 18:00 VN.
 * Preview tự động gợi ý ngày + giờ dựa theo config game.
 */
export function CreateDrawAction({ open, onOpenChange }: CreateDrawActionProps) {
  const [count, setCount] = useState(2);
  const [rows, setRows] = useState<DrawRow[]>(() => Array.from({ length: 2 }, emptyRow));
  const lastPreviewCountRef = useRef<number>(0);

  const preview = usePreviewDraws(open ? count : 0);
  const createDraw = useCreateDraw();

  useEffect(() => {
    setRows((prev) => {
      if (prev.length === count) return prev;
      return Array.from({ length: count }, (_, i) => prev[i] ?? emptyRow());
    });
  }, [count]);

  // Khi preview data về → fill vào rows như gợi ý
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
          date: fmtStoreDate(p.drawTime),
          drawNo: p.drawNo,
          drawTime: fmtDisplayTime(p.drawTime),
          isOpen: row.isOpen,
        };
      }),
    );
  }, [preview.data, count]);

  function handleOpenChange(v: boolean) {
    if (!v) {
      setCount(2);
      setRows(Array.from({ length: 2 }, emptyRow));
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
          date: fmtStoreDate(p.drawTime),
          drawNo: p.drawNo,
          drawTime: fmtDisplayTime(p.drawTime),
          isOpen: row.isOpen,
        };
      }),
    );
    lastPreviewCountRef.current = count;
  }

  const openCount = rows.filter((r) => r.isOpen).length;
  const scheduledCount = rows.length - openCount;
  const completedRows = rows.filter(isRowComplete);

  // Validate duplicate drawDate trong batch (Mega 6/45: drawId = drawDate)
  const duplicateDates = new Set<string>();
  const dateCounts = new Map<string, number>();
  for (const row of rows) {
    if (row.date) dateCounts.set(row.date, (dateCounts.get(row.date) ?? 0) + 1);
  }
  for (const [date, count] of dateCounts) {
    if (count > 1) duplicateDates.add(date);
  }
  const hasDuplicates = duplicateDates.size > 0;

  const canSubmit = completedRows.length === rows.length && !createDraw.isPending && !hasDuplicates;

  function handleCreate() {
    if (!canSubmit) return;
    createDraw.mutate(
      {
        draws: rows.map((row) => ({
          drawDate: row.date,
          drawNo: row.drawNo,
          drawTime: buildIso(row.date, row.drawTime),
          openNow: row.isOpen,
        })),
      },
      {
        onSuccess: () => handleOpenChange(false),
      },
    );
  }

  const allOpen = rows.length > 0 && rows.every((r) => r.isOpen);
  const someOpen = rows.some((r) => r.isOpen);
  const previewCount = preview.data?.draws.length ?? 0;
  const hasFewerPreviewSlots = !preview.isLoading && open && previewCount < count;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="size-4.5 text-teal-500" />
            Tạo kỳ quay Mega 6/45
          </DialogTitle>
          <DialogDescription>
            Tạo nhiều kỳ liên tiếp — 1 kỳ/ngày. Lịch gợi ý tự động tính theo cấu hình game.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Số kỳ + summary badges */}
          <div className="flex items-end gap-4 flex-wrap">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Số kỳ tạo
              </Label>
              <Input
                type="number"
                min={1}
                max={14}
                value={count}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v) && v >= 1 && v <= 14) setCount(v);
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
                <Badge className="bg-teal-600 hover:bg-teal-600 text-white text-xs">
                  {openCount} mở bán
                </Badge>
              )}
              {scheduledCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {scheduledCount} chờ lịch
                </Badge>
              )}
              {preview.data && preview.data.draws.length > 0 && (
                <button
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
              style={{ gridTemplateColumns: "1.5rem 1fr 6.5rem 9rem" }}
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
              <div className="flex items-center justify-end">
                <button
                  onClick={toggleAll}
                  className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  {allOpen ? (
                    <Unlock className="size-3 text-teal-600" />
                  ) : (
                    <Lock className="size-3" />
                  )}
                  <span className={cn(allOpen && "text-teal-600 dark:text-teal-400")}>
                    {allOpen ? "Đóng" : "Mở"}
                  </span>
                </button>
              </div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-border/50 max-h-80 overflow-y-auto">
              {rows.map((row, i) => {
                const complete = isRowComplete(row);
                const dateErr = !row.date;
                const timeErr = !row.drawTime;

                return (
                  <div
                    key={i}
                    className={cn(
                      "grid items-center gap-x-3 px-4 py-2.5 transition-colors",
                      duplicateDates.has(row.date)
                        ? "bg-red-50/50 dark:bg-red-950/15"
                        : row.isOpen
                          ? "bg-teal-50/50 dark:bg-teal-950/15"
                          : "hover:bg-muted/20",
                    )}
                    style={{ gridTemplateColumns: "1.5rem 1fr 6.5rem 9rem" }}
                  >
                    <span
                      className={cn(
                        "tabular-nums text-xs font-semibold",
                        row.isOpen
                          ? "text-teal-700 dark:text-teal-300"
                          : complete
                            ? "text-foreground"
                            : "text-muted-foreground",
                      )}
                    >
                      {i + 1}
                    </span>
                    <DatePickerCell
                      value={row.date}
                      onChange={(date) => updateRow(i, { date })}
                      hasError={dateErr}
                    />
                    <TimePickerCell
                      value={row.drawTime}
                      onChange={(drawTime) => updateRow(i, { drawTime })}
                      hasError={timeErr}
                    />
                    <div
                      onClick={() => toggleSlot(i)}
                      className="flex items-center justify-end gap-1.5 cursor-pointer select-none"
                    >
                      {row.isOpen ? (
                        <Unlock className="size-3 text-teal-500 shrink-0" />
                      ) : (
                        <Lock className="size-3 text-muted-foreground/40 shrink-0" />
                      )}
                      <Switch
                        checked={row.isOpen}
                        onCheckedChange={() => toggleSlot(i)}
                        className="scale-75 origin-right pointer-events-none"
                      />
                      <span
                        className={cn(
                          "text-[11px] font-medium min-w-12 text-left",
                          row.isOpen ? "text-teal-600 dark:text-teal-400" : "text-muted-foreground",
                        )}
                      >
                        {row.isOpen ? "Mở bán" : "Chờ lịch"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {completedRows.length < rows.length && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {rows.length - completedRows.length} kỳ chưa có đủ thông tin (ngày + giờ quay).
            </p>
          )}
          {hasDuplicates && (
            <p className="text-xs text-red-600 dark:text-red-400">
              Ngày bị trùng trong batch: {[...duplicateDates].join(", ")}. Mỗi ngày chỉ tạo 1 kỳ.
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
            className={cn(someOpen && "bg-teal-600 hover:bg-teal-700 text-white")}
          >
            {createDraw.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            Tạo {count} kỳ{openCount > 0 ? ` · ${openCount} mở bán` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
