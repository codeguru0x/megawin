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
  special: "bg-gradient-to-br from-game-max3d to-game-max3d-muted",
  first: "bg-gradient-to-br from-info to-primary",
  second: "bg-gradient-to-br from-game-max3dpro to-game-max3dpro-muted",
  third: "bg-gradient-to-br from-game-mega645 to-info",
};

const VARIANT_STYLES: Record<string, string> = {
  default: "bg-muted text-muted-foreground",
  special: "bg-linear-to-br from-game-max3d to-game-max3d-muted text-white shadow-md shadow-game-max3d/50",
  first: "bg-linear-to-br from-info to-primary text-white shadow-md shadow-info/40",
  second: "bg-linear-to-br from-game-max3dpro to-game-max3dpro-muted text-white shadow-sm shadow-game-max3dpro/40",
  third: "bg-linear-to-br from-game-mega645 to-info text-white shadow-sm shadow-game-mega645/40",
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
        "inline-flex items-center justify-center font-mono font-bold tracking-wider tabular-nums select-none",
        VARIANT_STYLES[variant],
        SIZE_STYLES[size],
        className,
      )}
    >
      {padded}
    </span>
  );
}
