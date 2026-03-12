"use client";

/**
 * Keno – Create Draw Action Dialog
 *
 * Tạo nhiều kỳ quay Keno liên tiếp.
 * Keno khác Lotto5/35:
 * - DrawNo: 001-~120 (mỗi ngày), nhập trực tiếp vào ô input thay vì dropdown
 * - Giờ quay: cố định theo chu kỳ 8 phút (06:00, 06:08, ..., 22:00)
 * - Preview từ API gợi ý drawNo + drawTime
 * - Staff có thể tự điền nếu preview không đủ hoặc muốn sửa
 * - Validate: drawId không trùng (date + drawNo phải unique)
 */

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
import { formatVNTime, formatVNDate } from "@megawin/shared/utils/date";
import { useCreateDraw, usePreviewDraws } from "../../../use-operations";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DrawRow {
  /** Ngày quay, format "YYYY-MM-DD". */
  date: string;
  /** Số thứ tự kỳ trong ngày (1-~120). 0 = chưa xác định. */
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
    /^\d{4}-\d{2}-\d{2}$/.test(row.date) &&
    row.drawNo >= 1 &&
    Number.isInteger(row.drawNo) &&
    /^\d{2}:\d{2}$/.test(row.drawTime)
  );
}

function parseDateStr(dateStr: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return undefined;
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y!, m! - 1, d!);
  return isNaN(dt.getTime()) ? undefined : dt;
}

/**
 * Validate duplicate drawId trong batch.
 * drawId = "YYYY-MM-DD.NNN" → trùng nếu (date + drawNo) giống nhau.
 */
function findDuplicateKey(rows: DrawRow[]): number | null {
  const seen = new Map<string, number>();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (!r.date || !r.drawNo) continue;
    const key = `${r.date}.${String(r.drawNo).padStart(3, "0")}`;
    if (seen.has(key)) return i;
    seen.set(key, i);
  }
  return null;
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
          fromYear={2025}
          toYear={2030}
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

export function CreateDrawAction({ open, onOpenChange }: CreateDrawActionProps) {
  const [count, setCount] = useState(5);
  const [rows, setRows] = useState<DrawRow[]>(() => Array.from({ length: 5 }, emptyRow));
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
      setCount(5);
      setRows(Array.from({ length: 5 }, emptyRow));
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
  const duplicateIdx = findDuplicateKey(rows);
  const canSubmit =
    completedRows.length === rows.length && duplicateIdx === null && !createDraw.isPending;

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
            <CalendarPlus className="size-4.5 text-orange-500" />
            Tạo kỳ quay Keno
          </DialogTitle>
          <DialogDescription>
            Tạo nhiều kỳ liên tiếp. Lịch gợi ý tự động tính theo chu kỳ 8 phút — staff có thể chỉnh
            sửa bất kỳ ô nào. Số kỳ (drawNo) phải duy nhất trong ngày.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Row 1: Số kỳ + badges */}
          <div className="flex items-end gap-4 flex-wrap">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Số kỳ tạo
              </Label>
              <Input
                type="number"
                min={1}
                max={30}
                value={count}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v) && v >= 1 && v <= 30) setCount(v);
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
                <Badge className="bg-orange-600 hover:bg-orange-600 text-white text-xs">
                  {openCount} mở bán
                </Badge>
              )}
              {scheduledCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {scheduledCount} chờ lịch
                </Badge>
              )}
              {hasFewerPreviewSlots && (
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                  Gợi ý chỉ có {previewCount}/{count} kỳ — tự điền các ô trống
                </Badge>
              )}
            </div>
          </div>

          {/* Bảng nhập liệu */}
          <div className="rounded-xl border overflow-hidden">
            {/* Header */}
            <div
              className="grid items-center gap-x-3 px-4 py-2 bg-muted/40 border-b"
              style={{ gridTemplateColumns: "1.5rem 1fr 6rem 7rem auto" }}
            >
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                #
              </span>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Ngày quay
              </span>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Số kỳ
              </span>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Giờ quay
              </span>
              <div className="flex items-center gap-2">
                {preview.data && preview.data.draws.length > 0 && (
                  <button
                    onClick={applyPreview}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                    title="Áp lại gợi ý từ preview"
                  >
                    <RefreshCw className="size-3" />
                  </button>
                )}
                <button
                  onClick={toggleAll}
                  className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  {allOpen ? (
                    <Unlock className="size-3 text-orange-600" />
                  ) : (
                    <Lock className="size-3" />
                  )}
                  <span className={cn(allOpen && "text-orange-600 dark:text-orange-400")}>
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
                const drawNoErr = row.drawNo === 0;
                const timeErr = !row.drawTime;
                const isDuplicate = duplicateIdx === i;

                return (
                  <div
                    key={i}
                    className={cn(
                      "grid items-center gap-x-3 px-4 py-2.5 transition-colors",
                      isDuplicate
                        ? "bg-red-50/50 dark:bg-red-950/15"
                        : row.isOpen
                          ? "bg-orange-50/50 dark:bg-orange-950/15"
                          : "hover:bg-muted/20",
                    )}
                    style={{ gridTemplateColumns: "1.5rem 1fr 6rem 7rem auto" }}
                  >
                    <span
                      className={cn(
                        "tabular-nums text-xs font-semibold",
                        isDuplicate
                          ? "text-red-600"
                          : row.isOpen
                            ? "text-orange-700 dark:text-orange-300"
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

                    {/* DrawNo: số thứ tự kỳ trong ngày (1-~120) */}
                    <Input
                      type="number"
                      min={1}
                      max={200}
                      value={row.drawNo === 0 ? "" : row.drawNo}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        updateRow(i, { drawNo: isNaN(v) ? 0 : v });
                      }}
                      placeholder="001"
                      className={cn(
                        "h-8 text-center font-mono text-xs tabular-nums",
                        (drawNoErr || isDuplicate) &&
                          "border-dashed border-amber-400 text-amber-600",
                      )}
                    />

                    <TimePickerCell
                      value={row.drawTime}
                      onChange={(drawTime) => updateRow(i, { drawTime })}
                      hasError={timeErr}
                    />

                    <div className="flex items-center gap-1.5">
                      {row.isOpen ? (
                        <Unlock className="size-3 text-orange-500 shrink-0" />
                      ) : (
                        <Lock className="size-3 text-muted-foreground/40 shrink-0" />
                      )}
                      <Switch
                        checked={row.isOpen}
                        onCheckedChange={() => toggleSlot(i)}
                        className="scale-75 origin-right"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {duplicateIdx !== null && (
            <p className="text-xs text-red-600 dark:text-red-400">
              Kỳ #{duplicateIdx + 1}: Số kỳ và ngày trùng với kỳ khác trong danh sách. Số kỳ phải
              duy nhất trong cùng ngày.
            </p>
          )}
          {duplicateIdx === null && completedRows.length < rows.length && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {rows.length - completedRows.length} kỳ chưa đủ thông tin (ngày + số kỳ + giờ quay).
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
            className={cn(someOpen && "bg-orange-600 hover:bg-orange-700 text-white")}
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
