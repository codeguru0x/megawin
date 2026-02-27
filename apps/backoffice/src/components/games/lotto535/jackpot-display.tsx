"use client";

import { cn } from "@/lib/utils";

interface JackpotDisplayProps {
  amount: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

function formatVND(amount: number): string {
  return amount.toLocaleString("en-US") + " ₫";
}

export function JackpotDisplay({
  amount,
  size = "md",
  className,
}: JackpotDisplayProps) {
  return (
    <div className={cn("flex flex-col", className)}>
      <span
        className={cn(
          "font-bold tabular-nums text-amber-600 dark:text-amber-400",
          size === "sm" && "text-sm",
          size === "md" && "text-lg",
          size === "lg" && "text-3xl"
        )}
      >
        {formatVND(amount)}
      </span>
    </div>
  );
}

export { formatVND };
