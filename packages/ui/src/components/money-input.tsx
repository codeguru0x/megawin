"use client";

import * as React from "react";

import { type NumberFormatValues, NumericFormat, type NumericFormatProps } from "react-number-format";

import { cn } from "../lib/cn";

export interface MoneyInputProps
  extends Omit<NumericFormatProps, "value" | "defaultValue" | "onValueChange" | "customInput"> {
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number | undefined) => void;
}

const INPUT_CLASSES = [
  "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
  "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
  "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  "tabular-nums",
] as const;

const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  (
    {
      className,
      value,
      defaultValue,
      onValueChange,
      decimalScale = 0,
      thousandSeparator = true,
      allowNegative = false,
      ...props
    },
    ref,
  ) => {
    function handleValueChange(values: NumberFormatValues) {
      onValueChange?.(values.floatValue);
    }

    return (
      <NumericFormat
        getInputRef={ref}
        className={cn(...INPUT_CLASSES, className)}
        value={value}
        defaultValue={defaultValue}
        onValueChange={handleValueChange}
        thousandSeparator={thousandSeparator}
        decimalScale={decimalScale}
        allowNegative={allowNegative}
        {...props}
      />
    );
  },
);

MoneyInput.displayName = "MoneyInput";

export { MoneyInput };
