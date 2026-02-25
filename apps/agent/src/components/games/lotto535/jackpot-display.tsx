"use client";

import { cn } from "@/lib/utils";

interface JackpotDisplayProps {
  amount: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

function formatVND(amount: number): string {
  if (amount >= 1_000_000_000) {
    const billions = amount / 1_000_000_000;
    return `${billions.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tỷ`;
  }
  if (amount >= 1_000_000) {
    const millions = amount / 1_000_000;
    return `${millions.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} triệu`;
  }
  return amount.toLocaleString("vi-VN") + " ₫";
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
