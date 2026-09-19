"use client";

import * as React from "react";

import { formatVN, formatVNDate, todayVN, toVNStartOfDay, TZDate, VN_TIMEZONE } from "@megawin/shared/utils";
import { subDays } from "date-fns";
import { CalendarIcon, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FinancialDatePickerProps {
  /** Ngày đang chọn dạng "YYYY-MM-DD". */
  value: string;
  /** Callback khi chọn ngày mới. */
  onChange: (date: string) => void;
  /** Label hiển thị trước trigger. Mặc định: "Ngày tài chính:" */
  label?: string;
  className?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface Preset {
  label: string;
  value: string;
}

/**
 * Preset nhanh cho single-date picker:
 * Hôm nay, Hôm qua, và 5 ngày gần nhất.
 */
function getPresets(): Preset[] {
  const now = new TZDate(new Date(), VN_TIMEZONE);
  const td = todayVN();
  return [
    { label: "Hôm nay", value: td },
    { label: "Hôm qua", value: formatVNDate(subDays(now, 1)) },
    { label: "2 ngày trước", value: formatVNDate(subDays(now, 2)) },
    { label: "3 ngày trước", value: formatVNDate(subDays(now, 3)) },
    { label: "5 ngày trước", value: formatVNDate(subDays(now, 5)) },
    { label: "7 ngày trước", value: formatVNDate(subDays(now, 7)) },
  ];
}

function displayDate(dateStr: string): string {
  if (!dateStr) {
    return "--";
  }
  try {
    return formatVN(toVNStartOfDay(dateStr), "dd/MM/yyyy");
  } catch {
    return "--";
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Single-date picker cho Dashboard.
 *
 * - 1 tháng calendar + 6 preset nhanh bên phải.
 * - Chọn ngày → commit ngay, đóng popover.
 * - Preset click → commit ngay + đóng.
 * - Disabled ngày tương lai.
 */
export function FinancialDatePicker({
  value,
  onChange,
  label = "Ngày tài chính:",
  className,
}: FinancialDatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const presets = React.useMemo(() => getPresets(), []);

  const selectedDate = React.useMemo(() => {
    try {
      return toVNStartOfDay(value);
    } catch {
      return undefined;
    }
  }, [value]);

  function handleDaySelect(date: Date | undefined) {
    if (!date) {
      return;
    }
    onChange(formatVNDate(date));
    setOpen(false);
  }

  function handlePreset(preset: Preset) {
    onChange(preset.value);
    setOpen(false);
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {label && <span className="text-muted-foreground text-sm font-medium">{label}</span>}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn("px-3 tabular-nums", !value && "text-muted-foreground")}>
            <CalendarIcon className="text-muted-foreground size-4" />
            <span className="font-medium">{displayDate(value)}</span>
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-auto p-0" align="end">
          <div className="divide-border flex divide-x">
            {/* ── Cột trái: Calendar 1 tháng ── */}
            <Calendar
              mode="single"
              defaultMonth={selectedDate ?? toVNStartOfDay(todayVN())}
              selected={selectedDate}
              onSelect={handleDaySelect}
              disabled={{ after: new Date() }}
              autoFocus
            />

            {/* ── Cột phải: Preset nhanh ── */}
            <div className="flex w-36 shrink-0 flex-col gap-0.5 p-2">
              <p className="text-muted-foreground text-3xs px-2 pt-0.5 pb-1 font-semibold tracking-widest uppercase">
                Nhanh
              </p>
              {presets.map((preset) => {
                const isActive = preset.value === value;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handlePreset(preset)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                      isActive ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-accent",
                    )}
                  >
                    {preset.label}
                    {isActive && <Check className="text-primary size-3.5 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
