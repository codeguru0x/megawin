"use client";

import { cn } from "@/lib/utils";

const DICE_DOTS: Record<number, string> = {
  1: "⚀",
  2: "⚁",
  3: "⚂",
  4: "⚃",
  5: "⚄",
  6: "⚅",
};

interface DiceDisplayProps {
  numbers: number[];
  size?: "sm" | "md" | "lg";
  showSum?: boolean;
  className?: string;
}

export function DiceDisplay({
  numbers,
  size = "md",
  showSum = true,
  className,
}: DiceDisplayProps) {
  const sum = numbers.reduce((a, b) => a + b, 0);

  const sizeClasses = {
    sm: "size-8 text-lg",
    md: "size-10 text-2xl",
    lg: "size-14 text-3xl",
  };

  const sumSizeClasses = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-xl",
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {numbers.map((n, i) => (
        <div
          key={i}
          className={cn(
            "flex items-center justify-center rounded-lg border-2 border-amber-300 bg-white shadow-sm dark:border-amber-700 dark:bg-amber-950/30",
            sizeClasses[size]
          )}
        >
          <span>{DICE_DOTS[n] ?? n}</span>
        </div>
      ))}
      {showSum && numbers.length > 0 && (
        <div className="flex items-center gap-1.5 ml-1">
          <span className="text-muted-foreground">=</span>
          <span
            className={cn(
              "font-bold tabular-nums text-amber-600 dark:text-amber-400",
              sumSizeClasses[size]
            )}
          >
            {sum}
          </span>
        </div>
      )}
    </div>
  );
}
