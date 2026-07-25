"use client";

import { cn } from "@/lib/utils";

interface TripletDisplayProps {
  value: string;
  variant?: "default" | "special" | "first" | "second" | "third" | "matched" | "result";
  size?: "sm" | "md" | "lg";
  className?: string;
}

export type TierVariant = "special" | "first" | "second" | "third";

/** Màu dot/icon cho từng giải — dùng chung ở publish-result-action và result display */
export const TIER_DOT_STYLES: Record<TierVariant, string> = {
  special: "bg-gradient-to-br from-amber-400 to-orange-500",
  first: "bg-gradient-to-br from-red-500 to-rose-600",
  second: "bg-gradient-to-br from-blue-500 to-indigo-600",
  third: "bg-gradient-to-br from-emerald-500 to-green-600",
};

const VARIANT_STYLES: Record<string, string> = {
  default: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
  special:
    "bg-linear-to-br from-amber-400 to-orange-500 text-white shadow-md shadow-amber-200/50 dark:shadow-amber-900/30",
  first: "bg-linear-to-br from-red-500 to-rose-600 text-white shadow-md shadow-red-200/40 dark:shadow-red-900/20",
  second: "bg-linear-to-br from-blue-500 to-indigo-600 text-white shadow-sm shadow-blue-200/40 dark:shadow-blue-900/20",
  third:
    "bg-linear-to-br from-emerald-500 to-green-600 text-white shadow-sm shadow-emerald-200/40 dark:shadow-emerald-900/20",
  // Highlight đối chiếu kết quả (entry-detail + winning-entries dialog):
  matched: "bg-primary text-primary-foreground ring-2 ring-primary/30",
  result: "bg-muted/60 text-muted-foreground/50",
};

const SIZE_STYLES: Record<string, string> = {
  sm: "h-7 min-w-[2.25rem] px-1.5 text-xs rounded-md",
  md: "h-9 min-w-[3rem] px-2 text-sm rounded-lg",
  lg: "h-11 min-w-[3.75rem] px-3 text-base rounded-xl",
};

export function TripletDisplay({ value, variant = "default", size = "md", className }: TripletDisplayProps) {
  const padded = String(value).padStart(3, "0");

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center font-mono font-bold tabular-nums select-none tracking-wider",
        VARIANT_STYLES[variant],
        SIZE_STYLES[size],
        className,
      )}
    >
      {padded}
    </span>
  );
}
