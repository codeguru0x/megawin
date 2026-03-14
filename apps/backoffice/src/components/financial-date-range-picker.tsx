"use client";

import * as React from "react";
import { CalendarIcon, Check } from "lucide-react";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subWeeks,
  subMonths,
  subDays,
  differenceInCalendarDays,
  parseISO,
  isValid,
  parse,
  isBefore,
} from "date-fns";
import { type DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  todayVN,
  formatVNDate,
  formatVN,
  toVNStartOfDay,
  TZDate,
  VN_TIMEZONE,
} from "@megawin/shared/utils/date";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FinancialDateRangePickerProps {
  /** Giá trị ngày bắt đầu dạng "YYYY-MM-DD". */
  from: string;
  /** Giá trị ngày kết thúc dạng "YYYY-MM-DD". */
  to: string;
  /** Callback khi xác nhận (nhấn Áp dụng hoặc chọn preset). */
  onChange: (from: string, to: string) => void;
  /** Label hiển thị trước trigger. Mặc định: "Ngày tài chính:". */
  label?: string;
  className?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toDateStr(date: Date): string {
  return formatVNDate(date);
}

interface Preset {
  label: string;
  from: string;
  to: string;
  group: "common" | "period";
}

/**
 * 8 preset ngày nhanh, chia 2 nhóm đều 4.
 *
 * - Phổ biến: Hôm nay, Hôm qua, 7 ngày qua, 30 ngày qua.
 * - Chu kỳ: Tuần này, Tuần trước, Tháng này, Tháng trước.
 */
function getPresets(): Preset[] {
  const now = new TZDate(new Date(), VN_TIMEZONE);
  const td = todayVN();
  const yesterday = subDays(now, 1);
  const d7 = subDays(now, 6);
  const d30 = subDays(now, 29);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
  const lastWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const lastMonthStart = startOfMonth(subMonths(now, 1));
  const lastMonthEnd = endOfMonth(subMonths(now, 1));

  return [
    { label: "Hôm nay", from: td, to: td, group: "common" },
    { label: "Hôm qua", from: toDateStr(yesterday), to: toDateStr(yesterday), group: "common" },
    { label: "7 ngày qua", from: toDateStr(d7), to: td, group: "common" },
    { label: "30 ngày qua", from: toDateStr(d30), to: td, group: "common" },
    { label: "Tuần này", from: toDateStr(weekStart), to: toDateStr(weekEnd), group: "period" },
    {
      label: "Tuần trước",
      from: toDateStr(lastWeekStart),
      to: toDateStr(lastWeekEnd),
      group: "period",
    },
    { label: "Tháng này", from: toDateStr(monthStart), to: toDateStr(monthEnd), group: "period" },
    {
      label: "Tháng trước",
      from: toDateStr(lastMonthStart),
      to: toDateStr(lastMonthEnd),
      group: "period",
    },
  ];
}

function displayDate(dateStr: string): string {
  if (!dateStr) return "--";
  const d = parseISO(dateStr);
  if (!isValid(d)) return "--";
  return formatVN(toVNStartOfDay(dateStr), "dd/MM/yyyy");
}

function dayCount(from: string, to: string): number {
  if (!from || !to) return 0;
  const a = parseISO(from);
  const b = parseISO(to);
  if (!isValid(a) || !isValid(b)) return 0;
  return differenceInCalendarDays(b, a) + 1;
}

function dayCountLabel(n: number): string {
  if (n <= 0) return "";
  if (n === 1) return "1 ngày";
  if (n === 7) return "1 tuần";
  if (n >= 28 && n <= 31) return "~1 tháng";
  return `${n} ngày`;
}

/** Parse "dd/MM/yyyy" → "YYYY-MM-DD". Trả undefined nếu không hợp lệ. */
function parseInputDate(input: string): string | undefined {
  if (input.length !== 10) return undefined;
  const d = parse(input, "dd/MM/yyyy", new Date());
  if (!isValid(d)) return undefined;
  const y = d.getFullYear();
  if (y < 2000 || y > 2100) return undefined;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

/**
 * Auto-format input thành dd/MM/yyyy khi gõ.
 * Chỉ cho phép số và "/", tự chèn "/" sau vị trí 2 và 5.
 */
function formatDateInput(raw: string, prev: string): string {
  // Chỉ giữ số
  let digits = raw.replace(/\D/g, "");
  if (digits.length > 8) digits = digits.slice(0, 8);

  // Tự chèn "/" sau dd và MM
  if (digits.length >= 5) {
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  }
  if (digits.length >= 3) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }

  // Cho phép user đã gõ "/" thủ công (nếu đang xóa ngược)
  if (raw.length < prev.length) return raw;

  return digits;
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * DateRangePicker cho các trang báo cáo tài chính.
 *
 * - Calendar 2 tháng + footer (inputs + badge + Áp dụng).
 * - 8 preset chia 2 nhóm đều 4 (Phổ biến / Chu kỳ), không scroll.
 * - Preset click chỉ cập nhật pending, KHÔNG commit — chỉ "Áp dụng" mới commit.
 * - 2 ô input dd/MM/yyyy để gõ ngày trực tiếp.
 * - Step-based selection: click 1 = start mới, click 2 = end.
 */
export function FinancialDateRangePicker({
  from,
  to,
  onChange,
  label = "Ngày tài chính:",
  className,
}: FinancialDateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [pendingRange, setPendingRange] = React.useState<DateRange | undefined>(undefined);
  const [selectStep, setSelectStep] = React.useState<"start" | "end">("start");
  const [fromInput, setFromInput] = React.useState("");
  const [toInput, setToInput] = React.useState("");

  const presets = React.useMemo(() => getPresets(), []);

  const committedRange: DateRange = React.useMemo(() => {
    const fromDate = from ? toVNStartOfDay(from) : undefined;
    const toDate = to ? toVNStartOfDay(to) : undefined;
    return {
      from: fromDate && isValid(fromDate) ? fromDate : undefined,
      to: toDate && isValid(toDate) ? toDate : undefined,
    };
  }, [from, to]);

  function handleOpenChange(v: boolean) {
    if (v) {
      setPendingRange(committedRange);
      setFromInput(displayDate(from));
      setToInput(displayDate(to));
      setSelectStep("start");
    } else {
      setPendingRange(undefined);
    }
    setOpen(v);
  }

  /** Step-based: click 1 = new start, click 2 = end (auto-swap). */
  function handleCalendarSelect(range: DateRange | undefined) {
    if (!range?.from) return;

    if (selectStep === "start") {
      const newRange: DateRange = { from: range.from, to: undefined };
      setPendingRange(newRange);
      setFromInput(formatVN(range.from, "dd/MM/yyyy"));
      setToInput("");
      setSelectStep("end");
    } else {
      const clickedDate = range.to ?? range.from;
      let start = pendingRange?.from ?? range.from;
      let end = clickedDate;
      if (isBefore(end, start)) [start, end] = [end, start];

      const newRange: DateRange = { from: start, to: end };
      setPendingRange(newRange);
      setFromInput(formatVN(start, "dd/MM/yyyy"));
      setToInput(formatVN(end, "dd/MM/yyyy"));
      setSelectStep("start");
    }
  }

  function handleConfirm() {
    if (pendingRange?.from && pendingRange.to) {
      onChange(toDateStr(pendingRange.from), toDateStr(pendingRange.to));
    } else if (pendingRange?.from) {
      const d = toDateStr(pendingRange.from);
      onChange(d, d);
    }
    setOpen(false);
  }

  /** Preset: cập nhật pending + inputs, KHÔNG đóng popover. */
  function handlePreset(preset: Preset) {
    const fromDate = toVNStartOfDay(preset.from);
    const toDate = toVNStartOfDay(preset.to);
    setPendingRange({ from: fromDate, to: toDate });
    setFromInput(displayDate(preset.from));
    setToInput(displayDate(preset.to));
    setSelectStep("start");
  }

  function handleFromInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFromInput(formatDateInput(e.target.value, fromInput));
  }

  function handleToInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setToInput(formatDateInput(e.target.value, toInput));
  }

  function handleFromInputBlur() {
    const iso = parseInputDate(fromInput);
    if (!iso) {
      setFromInput(pendingRange?.from ? formatVN(pendingRange.from, "dd/MM/yyyy") : "");
      return;
    }
    const d = toVNStartOfDay(iso);
    const newRange: DateRange = { from: d, to: pendingRange?.to };
    if (newRange.to && isBefore(newRange.to, d)) {
      newRange.to = d;
      setToInput(formatVN(d, "dd/MM/yyyy"));
    }
    setPendingRange(newRange);
  }

  function handleToInputBlur() {
    const iso = parseInputDate(toInput);
    if (!iso) {
      setToInput(pendingRange?.to ? formatVN(pendingRange.to, "dd/MM/yyyy") : "");
      return;
    }
    const d = toVNStartOfDay(iso);
    const newRange: DateRange = { from: pendingRange?.from, to: d };
    if (newRange.from && isBefore(d, newRange.from)) {
      newRange.from = d;
      setFromInput(formatVN(d, "dd/MM/yyyy"));
    }
    setPendingRange(newRange);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && canConfirm) {
      e.preventDefault();
      handleConfirm();
    }
  }

  const numDays = dayCount(from, to);
  const isSameDay = from === to;
  const buttonLabel = isSameDay ? displayDate(from) : `${displayDate(from)} — ${displayDate(to)}`;

  const pendingDays =
    pendingRange?.from && pendingRange?.to
      ? differenceInCalendarDays(pendingRange.to, pendingRange.from) + 1
      : 0;

  const canConfirm = !!pendingRange?.from;
  const commonPresets = presets.filter((p) => p.group === "common");
  const periodPresets = presets.filter((p) => p.group === "period");

  /** Kiểm tra preset có đang active (khớp pending) không. */
  function isPresetActive(preset: Preset) {
    if (!pendingRange?.from) return false;
    const pFrom = toDateStr(pendingRange.from);
    const pTo = pendingRange.to ? toDateStr(pendingRange.to) : pFrom;
    return preset.from === pFrom && preset.to === pTo;
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      {label && <span className="text-sm font-medium text-foreground">{label}</span>}

      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn("h-9 gap-2 px-3 text-sm tabular-nums", !from && "text-muted-foreground")}
          >
            <CalendarIcon className="size-4 text-muted-foreground" />
            <span className="font-medium">{buttonLabel}</span>
            {numDays > 0 && (
              <span className="ml-0.5 inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                {dayCountLabel(numDays)}
              </span>
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-auto p-0" align="start" onKeyDown={handleKeyDown}>
          <div className="flex divide-x divide-border">
            {/* ── Cột trái: Calendar + Footer ── */}
            <div className="flex flex-col">
              <Calendar
                mode="range"
                defaultMonth={committedRange.from ?? toVNStartOfDay(todayVN())}
                selected={pendingRange}
                onSelect={handleCalendarSelect}
                numberOfMonths={2}
                disabled={{ after: new Date() }}
              />

              <div className="flex items-center gap-3 border-t border-border px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="dd/MM/yyyy"
                    maxLength={10}
                    value={fromInput}
                    onChange={handleFromInputChange}
                    onBlur={handleFromInputBlur}
                    className="h-7 w-22 rounded-md border border-input bg-transparent px-2 text-xs tabular-nums text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                  />
                  <span className="text-xs text-muted-foreground">—</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="dd/MM/yyyy"
                    maxLength={10}
                    value={toInput}
                    onChange={handleToInputChange}
                    onBlur={handleToInputBlur}
                    className="h-7 w-22 rounded-md border border-input bg-transparent px-2 text-xs tabular-nums text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                  />
                </div>

                {pendingDays > 1 && (
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                    {dayCountLabel(pendingDays)}
                  </span>
                )}

                <div className="flex-1" />

                <Button
                  size="sm"
                  onClick={handleConfirm}
                  disabled={!canConfirm}
                  className="shrink-0 gap-1.5"
                >
                  <Check className="size-3.5" />
                  Áp dụng
                </Button>
              </div>
            </div>

            {/* ── Cột phải: 8 Presets, 2 nhóm đều 4 ── */}
            <div className="flex w-40 shrink-0 flex-col gap-2 p-1.5">
              <p className="px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Phổ biến
              </p>
              <div className="flex flex-col gap-0.5">
                {commonPresets.map((preset) => (
                  <PresetButton
                    key={preset.label}
                    label={preset.label}
                    active={isPresetActive(preset)}
                    onClick={() => handlePreset(preset)}
                  />
                ))}
              </div>

              <div className="h-px bg-border" />

              <p className="px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Chu kỳ
              </p>
              <div className="flex flex-col gap-0.5">
                {periodPresets.map((preset) => (
                  <PresetButton
                    key={preset.label}
                    label={preset.label}
                    active={isPresetActive(preset)}
                    onClick={() => handlePreset(preset)}
                  />
                ))}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ─── Preset Button ────────────────────────────────────────────────────────────

function PresetButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-sm transition-colors",
        active ? "bg-primary/10 font-medium text-primary" : "text-foreground hover:bg-accent",
      )}
    >
      {label}
      {active && <Check className="size-3.5 shrink-0 text-primary" />}
    </button>
  );
}
