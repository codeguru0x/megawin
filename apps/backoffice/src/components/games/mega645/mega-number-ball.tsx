"use client";

import { cn } from "@/lib/utils";

interface MegaNumberBallProps {
  number: number;
  size?: "sm" | "md" | "lg";
}

export function MegaNumberBall({ number, size = "md" }: MegaNumberBallProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-bold tabular-nums select-none bg-orange-500 text-white",
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
 * Variant highlight cho ball Mega 6/45 khi đối chiếu với kết quả kỳ quay:
 * - `matched`: số player chọn TRÚNG kết quả (primary + ring).
 * - `result`: số kết quả kỳ quay player KHÔNG chọn (muted nhạt).
 * - `default`: số player chọn nhưng KHÔNG trúng.
 */
export type MegaMatchBallVariant = "default" | "matched" | "result";

const MEGA_MATCH_BALL_STYLE: Record<MegaMatchBallVariant, string> = {
  matched: "bg-primary text-primary-foreground ring-2 ring-primary/30",
  result: "bg-muted/60 text-muted-foreground/60",
  default: "bg-muted text-muted-foreground",
};

/**
 * Ball Mega 6/45 dùng chung cho các bảng đối chiếu số trúng
 * (entry-detail-dialog + winning-entries-dialog). Nhận `n` dạng string zero-padded.
 */
export function MegaMatchBall({
  n,
  variant = "default",
  size = "md",
}: {
  n: string;
  variant?: MegaMatchBallVariant;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-bold tabular-nums select-none",
        size === "sm" ? "size-7 text-[11px]" : "size-8 text-xs",
        MEGA_MATCH_BALL_STYLE[variant],
      )}
    >
      {n}
    </span>
  );
}
