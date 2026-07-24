"use client";

import { cn } from "@/lib/utils";

// ─── Size tokens ────────────────────────────────────────────────────────────

const BALL_SIZE: Record<"sm" | "md" | "lg", { ball: string; text: string }> = {
  sm: { ball: "size-7", text: "text-sm" },
  md: { ball: "size-10", text: "text-base" },
  lg: { ball: "size-14", text: "text-xl" },
};

const SUM_SIZE: Record<"sm" | "md" | "lg", string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-xl",
};

// ─── Bingo18NumberBall ───────────────────────────────────────────────────────

interface Bingo18NumberBallProps {
  /** Giá trị xúc xắc (1-6). */
  number: number;
  size?: "sm" | "md" | "lg";
  /** Highlight nhẹ khi là một phần của cặp hoặc bộ ba giống nhau. */
  highlight?: boolean;
  className?: string;
}

export function Bingo18NumberBall({
  number,
  size = "md",
  highlight = false,
  className,
}: Bingo18NumberBallProps) {
  const { ball, text } = BALL_SIZE[size];
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-bold tabular-nums select-none leading-none shrink-0 transition-all duration-150",
        ball,
        text,
        highlight
          ? "bg-amber-500 text-white ring-2 ring-amber-400 ring-offset-1"
          : "bg-amber-500 text-white",
        className,
      )}
    >
      {number}
    </span>
  );
}

// ─── Match Die ───────────────────────────────────────────────────────────────

/**
 * Variant của xúc xắc dùng để đối chiếu số player chọn với kết quả quay.
 *
 * Dùng chung giữa entry-detail-dialog (báo cáo settle) và winning-entries-dialog
 * (báo cáo trúng thưởng Operations) — 1 nguồn chân lý cho cách highlight số trúng.
 *
 * - `matched`: số player chọn TRÙNG kết quả quay — nền primary + ring.
 * - `result`: 1 trong 3 số kết quả kỳ quay.
 * - `default`: số player chọn KHÔNG trúng — muted.
 */
export type Bingo18MatchDieVariant = "default" | "matched" | "result";

const BINGO18_MATCH_DIE_STYLE: Record<Bingo18MatchDieVariant, string> = {
  matched: "bg-primary text-primary-foreground ring-2 ring-primary/30",
  result: "bg-primary text-primary-foreground shadow-md",
  default: "bg-muted text-muted-foreground",
};

const BINGO18_MATCH_DIE_SIZE: Record<"sm" | "md" | "lg", { die: string; round: string }> = {
  sm: { die: "size-7 text-xs", round: "rounded-lg" },
  md: { die: "size-8 text-sm", round: "rounded-lg" },
  lg: { die: "size-11 text-xl font-extrabold rounded-full", round: "rounded-full" },
};

/**
 * Xúc xắc đối chiếu Bingo 18 (1-6) — semantic theo `primary` token, không hardcode màu game.
 *
 * @param n - Giá trị xúc xắc (1-6).
 * @param variant - Trạng thái đối chiếu với kết quả quay.
 */
export function Bingo18MatchDie({
  n,
  variant = "default",
  size = "md",
}: {
  n: number | string;
  variant?: Bingo18MatchDieVariant;
  size?: "sm" | "md" | "lg";
}) {
  const { die, round } = BINGO18_MATCH_DIE_SIZE[size];
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center font-bold tabular-nums",
        round,
        die,
        BINGO18_MATCH_DIE_STYLE[variant],
      )}
    >
      {n}
    </span>
  );
}

// ─── DiceDisplay (backward-compatible wrapper) ───────────────────────────────

interface DiceDisplayProps {
  numbers: number[];
  size?: "sm" | "md" | "lg";
  showSum?: boolean;
  className?: string;
}

/**
 * Hiển thị kết quả 3 số Bingo 18 dưới dạng number balls (amber).
 * Tự động highlight đôi / ba giống nhau.
 */
export function DiceDisplay({ numbers, size = "md", showSum = true, className }: DiceDisplayProps) {
  const sum = numbers.reduce((a, b) => a + b, 0);

  // Đánh dấu các số xuất hiện ≥ 2 lần để highlight
  const counts = numbers.reduce<Record<number, number>>((acc, n) => {
    acc[n] = (acc[n] ?? 0) + 1;
    return acc;
  }, {});
  const hasDuplicates = Object.values(counts).some((c) => c >= 2);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {numbers.map((n, i) => (
        <Bingo18NumberBall
          key={i}
          number={n}
          size={size}
          highlight={hasDuplicates && (counts[n] ?? 0) >= 2}
        />
      ))}
      {showSum && numbers.length > 0 && (
        <div className="flex items-center gap-1 ml-1">
          <span className="text-muted-foreground">=</span>
          <span
            className={cn(
              "font-bold tabular-nums text-amber-600 dark:text-amber-400",
              SUM_SIZE[size],
            )}
          >
            {sum}
          </span>
        </div>
      )}
    </div>
  );
}
