"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface TimeInputProps extends Omit<React.ComponentProps<"input">, "type" | "onChange"> {
  /** Giá trị dạng "HH:mm" */
  value?: string;
  onChange?: (value: string) => void;
}

/**
 * Input chọn giờ dạng native `<input type="time">`.
 * Trả về giá trị theo format "HH:mm" — tương thích trực tiếp với Zod schema
 * và field data `drawTime` trên server.
 */
const TimeInput = React.forwardRef<HTMLInputElement, TimeInputProps>(
  ({ className, value, onChange, ...props }, ref) => {
    return (
      <input
        type="time"
        ref={ref}
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value)}
        data-slot="input"
        className={cn(
          // Base input styles (mirror từ input.tsx)
          "border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1",
          "text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm",
          "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
          "dark:bg-input/30",
          // Time-specific: ẩn spinner mặc định trên một số browser (webkit)
          "[&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:cursor-pointer",
          className,
        )}
        {...props}
      />
    );
  },
);

TimeInput.displayName = "TimeInput";

export { TimeInput };
