"use client";

import { cn } from "@/lib/utils";

interface PowerNumberBallProps {
  number: number;
  variant?: "main" | "bonus";
  size?: "sm" | "md" | "lg";
}

export function PowerNumberBall({ number, variant = "main", size = "md" }: PowerNumberBallProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-bold tabular-nums select-none",
        variant === "main" ? "bg-red-500 text-white" : "bg-blue-600 text-white",
        size === "sm" && "size-7 text-xs",
        size === "md" && "size-9 text-sm",
        size === "lg" && "size-11 text-base",
      )}
    >
      {String(number).padStart(2, "0")}
    </span>
  );
}

/**
 * Variant highlight cho ball Power 6/55 khi đối chiếu với kết quả kỳ quay:
 * - `matched`: số chính player chọn TRÚNG (primary + ring).
 * - `bonus`: số player chọn trùng bonus number (amber + ring).
 * - `result`: số chính kết quả kỳ quay player KHÔNG chọn (muted nhạt).
 * - `result-bonus`: bonus number của kỳ quay player KHÔNG chọn (amber nhạt).
 * - `default`: số player chọn nhưng KHÔNG trúng.
 */
export type PowerMatchBallVariant = "default" | "matched" | "bonus" | "result" | "result-bonus";

const POWER_MATCH_BALL_STYLE: Record<PowerMatchBallVariant, string> = {
  matched: "bg-primary text-primary-foreground ring-2 ring-primary/30",
  bonus: "bg-amber-500 text-white ring-2 ring-amber-300/40",
  result: "bg-muted/60 text-muted-foreground/60",
  "result-bonus": "bg-amber-200/60 text-amber-700/60 dark:bg-amber-900/40 dark:text-amber-400/60",
  default: "bg-muted text-muted-foreground",
};

/**
 * Ball Power 6/55 dùng chung cho bảng đối chiếu số trúng
 * (entry-detail-dialog + winning-entries-dialog). Nhận `n` dạng string zero-padded.
 */
export function PowerMatchBall({
  n,
  variant = "default",
  size = "md",
}: {
  n: string;
  variant?: PowerMatchBallVariant;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-bold tabular-nums select-none",
        size === "sm" ? "size-7 text-[11px]" : "size-8 text-xs",
        POWER_MATCH_BALL_STYLE[variant],
      )}
    >
      {n}
    </span>
  );
}
