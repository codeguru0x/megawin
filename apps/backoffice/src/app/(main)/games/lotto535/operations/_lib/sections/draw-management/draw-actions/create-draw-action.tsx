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
  /** Ngày quay, format "YYYY-MM-DD". Trống nếu chưa chọn. */
  date: string;
  /** Số thứ tự kỳ trong ngày: 1 = sáng (13h), 2 = tối (21h). 0 nếu chưa xác định. */
  drawNo: 1 | 2 | 0;
  /** Giờ quay, format "HH:mm". */
  drawTime: string;
  /** Mở bán ngay khi tạo. */
  isOpen: boolean;
}

function emptyRow(): DrawRow {
  return { date: "", drawNo: 0, drawTime: "", isOpen: false };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** "HH:mm" từ ISO string, theo giờ VN. */
function fmtDisplayTime(iso: string): string {
  return formatVNTime(new Date(iso));
}

/** "YYYY-MM-DD" từ ISO string, theo giờ VN. */
function fmtStoreDate(iso: string): string {
  return formatVNDate(new Date(iso));
}

/** Tạo ISO string từ date "YYYY-MM-DD" + time "HH:mm" (giờ VN). */
function buildIso(date: string, time: string): string {
  // Dùng trực tiếp format ISO với offset +07:00 để đúng timezone VN.
  return `${date}T${time}:00+07:00`;
}

/** Kiểm tra row đã có đủ thông tin để submit. */
function isRowComplete(row: DrawRow): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(row.date) &&
    (row.drawNo === 1 || row.drawNo === 2) &&
    /^\d{2}:\d{2}$/.test(row.drawTime)
  );
}

/** Parse "YYYY-MM-DD" sang Date object. */
function parseDateStr(dateStr: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return undefined;
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y!, m! - 1, d!);
  return isNaN(dt.getTime()) ? undefined : dt;
}

// ─── DatePicker (calendar popover) ───────────────────────────────────────────

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

/**
 * Input time native HTML5 — trình duyệt xử lý picker chính xác từng phút.
 * Giá trị format "HH:mm", tương thích trực tiếp với input[type="time"].
 */
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
  const [count, setCount] = useState(2);
  const [rows, setRows] = useState<DrawRow[]>(() => Array.from({ length: 2 }, emptyRow));

  // Ref theo dõi lần preview load gần nhất để tránh overwrite khi user đang sửa.
  const lastPreviewCountRef = useRef<number>(0);

  const preview = usePreviewDraws(open ? count : 0);
  const createDraw = useCreateDraw();

  // Khi count thay đổi → resize rows, giữ lại dữ liệu cũ.
  useEffect(() => {
    setRows((prev) => {
      if (prev.length === count) return prev;
      return Array.from({ length: count }, (_, i) => prev[i] ?? emptyRow());
    });
  }, [count]);

  // Khi preview data về → fill vào rows như gợi ý (không overwrite nếu user đã sửa).
  useEffect(() => {
    if (!preview.data) return;
    const previewDraws = preview.data.draws;
    if (previewDraws.length === 0) return;

    // Chỉ fill một lần cho count này để không reset lại khi user đang sửa.
    if (lastPreviewCountRef.current === count) return;
    lastPreviewCountRef.current = count;

    setRows((prev) =>
      prev.map((row, i) => {
        const p = previewDraws[i];
        if (!p) return row;
        // Chỉ fill nếu row chưa có dữ liệu (user chưa nhập gì).
        const isEmpty = row.date === "" && row.drawTime === "";
        if (!isEmpty) return row;
        return {
          date: fmtStoreDate(p.drawTime),
          drawNo: p.drawNo as 1 | 2,
          drawTime: fmtDisplayTime(p.drawTime),
          isOpen: row.isOpen,
        };
      }),
    );
  }, [preview.data, count]);

  // Khi dialog đóng → reset về count=2, rows trống.
  function handleOpenChange(v: boolean) {
    if (!v) {
      setCount(2);
      setRows(Array.from({ length: 2 }, emptyRow));
      lastPreviewCountRef.current = 0;
    }
    onOpenChange(v);
  }

  // ─── Row helpers ────────────────────────────────────────────────────────────

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

  /** Fill lại toàn bộ rows từ preview (cho phép re-apply khi user muốn reset). */
  function applyPreview() {
    if (!preview.data) return;
    lastPreviewCountRef.current = 0;
    setRows((prev) =>
      prev.map((row, i) => {
        const p = preview.data!.draws[i];
        if (!p) return emptyRow();
        return {
          date: fmtStoreDate(p.drawTime),
          drawNo: p.drawNo as 1 | 2,
          drawTime: fmtDisplayTime(p.drawTime),
          isOpen: row.isOpen,
        };
      }),
    );
    lastPreviewCountRef.current = count;
  }

  // ─── Submit ─────────────────────────────────────────────────────────────────

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
          drawNo: row.drawNo as 1 | 2,
          drawTime: buildIso(row.date, row.drawTime),
          openNow: row.isOpen,
        })),
      },
      {
        onSuccess: () => {
          handleOpenChange(false);
        },
      },
    );
  }

  // ─── Derived display ─────────────────────────────────────────────────────────

  const allOpen = rows.length > 0 && rows.every((r) => r.isOpen);
  const someOpen = rows.some((r) => r.isOpen);
  const previewCount = preview.data?.draws.length ?? 0;
  const hasFewerPreviewSlots = !preview.isLoading && open && previewCount < count;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="size-4.5 text-emerald-500" />
            Tạo kỳ quay Lotto 5/35
          </DialogTitle>
          <DialogDescription>
            Tạo nhiều kỳ liên tiếp. Lịch gợi ý tự động tính theo cấu hình game — staff có thể chỉnh
            sửa bất kỳ ô nào trước khi xác nhận.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Row 1: Số kỳ + summary badges */}
          <div className="flex items-end gap-4 flex-wrap">
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

            <div className="flex flex-wrap gap-1.5 pb-0.5 items-center">
              {preview.isLoading && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  Đang lấy gợi ý...
                </span>
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
            {/* Table header */}
            <div
              className="grid items-center gap-x-3 px-4 py-2 bg-muted/40 border-b"
              style={{ gridTemplateColumns: "1.5rem 1fr 8.5rem 7rem auto" }}
            >
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                #
              </span>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Ngày quay
              </span>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Kỳ
              </span>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Giờ quay
              </span>
              {/* Toggle all + Apply preview */}
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
                  title={allOpen ? "Tắt tất cả" : "Mở bán tất cả"}
                >
                  {allOpen ? (
                    <Unlock className="size-3 text-emerald-600" />
                  ) : (
                    <Lock className="size-3" />
                  )}
                  <span className={cn(allOpen && "text-emerald-600 dark:text-emerald-400")}>
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

                return (
                  <div
                    key={i}
                    className={cn(
                      "grid items-center gap-x-3 px-4 py-2.5 transition-colors",
                      row.isOpen ? "bg-emerald-50/50 dark:bg-emerald-950/15" : "hover:bg-muted/20",
                    )}
                    style={{ gridTemplateColumns: "1.5rem 1fr 8.5rem 7rem auto" }}
                  >
                    {/* Số thứ tự */}
                    <span
                      className={cn(
                        "tabular-nums text-xs font-semibold",
                        row.isOpen
                          ? "text-emerald-700 dark:text-emerald-300"
                          : complete
                            ? "text-foreground"
                            : "text-muted-foreground",
                      )}
                    >
                      {i + 1}
                    </span>

                    {/* Ngày — date picker */}
                    <DatePickerCell
                      value={row.date}
                      onChange={(date) => updateRow(i, { date })}
                      hasError={dateErr}
                    />

                    {/* DrawNo: 1 = K1 (13h), 2 = K2 (21h) */}
                    <div className="relative">
                      <select
                        value={row.drawNo}
                        onChange={(e) =>
                          updateRow(i, { drawNo: Number(e.target.value) as 1 | 2 | 0 })
                        }
                        className={cn(
                          "h-8 w-full rounded-md border bg-background px-2.5 text-xs font-mono tabular-nums",
                          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 transition-colors",
                          drawNoErr
                            ? "border-dashed border-amber-400 text-amber-500"
                            : "border-input text-foreground",
                        )}
                      >
                        <option value={0} disabled>
                          Chọn
                        </option>
                        <option value={1}>Kỳ 1 · 13h</option>
                        <option value={2}>Kỳ 2 · 21h</option>
                      </select>
                    </div>

                    {/* Giờ quay — time picker */}
                    <TimePickerCell
                      value={row.drawTime}
                      onChange={(drawTime) => updateRow(i, { drawTime })}
                      hasError={timeErr}
                    />

                    {/* Per-row open switch */}
                    <div className="flex items-center gap-1.5">
                      {row.isOpen ? (
                        <Unlock className="size-3 text-emerald-500 shrink-0" />
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

          {/* Hint khi có ô chưa điền */}
          {completedRows.length < rows.length && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {rows.length - completedRows.length} kỳ chưa có đủ thông tin (ngày + kỳ + giờ quay).
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
            className={cn(someOpen && "bg-emerald-600 hover:bg-emerald-700 text-white")}
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
