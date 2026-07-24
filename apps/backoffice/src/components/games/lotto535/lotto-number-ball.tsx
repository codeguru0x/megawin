"use client";

import { cn } from "@/lib/utils";
import {
  LOTTO_MAIN_BG,
  LOTTO_MUTED_BG,
  LOTTO_NUMBER_SIZE,
  LOTTO_SPECIAL_BG,
  type LottoNumberSize,
} from "./lotto-number-tokens";

interface LottoNumberBallProps {
  number: string;
  variant?: "main" | "special";
  size?: LottoNumberSize;
  muted?: boolean;
}

export function LottoNumberBall({
  number,
  variant = "main",
  size = "md",
  muted = false,
}: LottoNumberBallProps) {
  const { sizeClass, textClass } = LOTTO_NUMBER_SIZE[size];
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-bold tabular-nums select-none leading-none shrink-0",
        sizeClass,
        textClass,
        muted ? LOTTO_MUTED_BG : variant === "main" ? LOTTO_MAIN_BG : LOTTO_SPECIAL_BG,
      )}
    >
      {number}
    </span>
  );
}

/**
 * Variant highlight cho ball Lotto 5/35 khi đối chiếu với kết quả kỳ quay:
 * - `matched`: số chính player chọn TRÚNG (primary + ring).
 * - `special`: số đặc biệt player chọn nhưng KHÔNG trúng (muted + viền amber).
 * - `special-matched`: số đặc biệt player chọn TRÚNG (amber đặc + ring).
 * - `result`: số chính kết quả kỳ quay player KHÔNG chọn (muted nhạt).
 * - `result-special`: số ĐB kết quả kỳ quay player KHÔNG chọn (amber nhạt).
 * - `default`: số chính player chọn nhưng KHÔNG trúng.
 */
export type LottoMatchBallVariant =
  | "default"
  | "matched"
  | "special"
  | "special-matched"
  | "result"
  | "result-special";

const LOTTO_MATCH_BALL_STYLE: Record<LottoMatchBallVariant, string> = {
  matched: "bg-primary text-primary-foreground ring-2 ring-primary/30",
  special: "bg-muted text-muted-foreground ring-1 ring-amber-400",
  "special-matched": "bg-amber-500 text-white ring-2 ring-amber-300/40",
  result: "bg-muted/60 text-muted-foreground/60",
  "result-special": "bg-amber-200/60 text-amber-700/60 dark:bg-amber-900/40 dark:text-amber-400/60",
  default: "bg-muted text-muted-foreground",
};

/**
 * Ball Lotto 5/35 dùng chung cho bảng đối chiếu số trúng
 * (entry-detail-dialog + winning-entries-dialog). Nhận `n` dạng string zero-padded.
 */
export function LottoMatchBall({
  n,
  variant = "default",
  size = "md",
  title,
}: {
  n: string;
  variant?: LottoMatchBallVariant;
  size?: "sm" | "md";
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center justify-center rounded-full font-bold tabular-nums select-none",
        size === "sm" ? "size-7 text-[11px]" : "size-8 text-xs",
        LOTTO_MATCH_BALL_STYLE[variant],
      )}
    >
      {n}
    </span>
  );
}
