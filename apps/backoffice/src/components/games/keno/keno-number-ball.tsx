"use client";

import { cn } from "@/lib/utils";

interface KenoNumberBallProps {
  number: number;
  variant?: "default" | "matched" | "big" | "small";
  size?: "sm" | "md" | "lg";
}

export function KenoNumberBall({ number, variant = "default", size = "md" }: KenoNumberBallProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-bold tabular-nums select-none",
        variant === "default" && "bg-sky-500 text-white",
        variant === "matched" && "bg-emerald-500 text-white ring-2 ring-emerald-300",
        variant === "big" && "bg-orange-500 text-white",
        variant === "small" && "bg-teal-500 text-white",
        size === "sm" && "size-7 text-xs",
        size === "md" && "size-9 text-sm",
        size === "lg" && "size-11 text-base",
      )}
    >
      {String(number).padStart(2, "0")}
    </span>
  );
}

// ─── Match Ball ────────────────────────────────────────────────────────────

/**
 * Variant của ball dùng để đối chiếu số player chọn với kết quả quay.
 *
 * Dùng chung giữa entry-detail-dialog (báo cáo settle) và winning-entries-dialog
 * (báo cáo trúng thưởng Operations) — 1 nguồn chân lý cho cách highlight số trúng.
 *
 * - `matched`: số player chọn TRÙNG kết quả quay — nền primary + ring.
 * - `default`: số player chọn KHÔNG trúng — muted, làm nền.
 * - `result`: 1 trong 20 số kết quả kỳ quay (player không chọn).
 * - `result-picked`: số kết quả mà player có chọn — nền primary đậm.
 */
export type KenoMatchBallVariant = "default" | "matched" | "result" | "result-picked";

const KENO_MATCH_BALL_STYLE: Record<KenoMatchBallVariant, string> = {
  matched: "bg-primary text-primary-foreground ring-2 ring-primary/30",
  "result-picked": "bg-primary text-primary-foreground",
  result: "bg-muted/80 text-muted-foreground",
  default: "bg-muted text-muted-foreground",
};

/**
 * Ball đối chiếu số Keno (01-80) — semantic theo `primary` token, không hardcode màu game.
 *
 * @param n - Số dạng string zero-padded ("01"-"80").
 * @param variant - Trạng thái đối chiếu với kết quả quay.
 */
export function KenoMatchBall({
  n,
  variant = "default",
}: {
  n: string;
  variant?: KenoMatchBallVariant;
}) {
  return (
    <span
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-full text-xs font-bold tabular-nums",
        KENO_MATCH_BALL_STYLE[variant],
      )}
    >
      {n}
    </span>
  );
}
