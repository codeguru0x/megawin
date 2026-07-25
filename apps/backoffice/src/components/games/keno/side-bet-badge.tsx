"use client";

import { cn } from "@/lib/utils";

export { formatVNDCompact as formatVND } from "@megawin/shared/utils";

interface KenoSideBetBadgeProps {
  type: "bigSmall" | "evenOdd";
  bet: string;
  className?: string;
}

const BIG_SMALL_LABELS: Record<string, { label: string; color: string }> = {
  big: {
    label: "Lớn",
    color: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  },
  bigSmallDraw: {
    label: "Hoà L/N",
    color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  },
  small: { label: "Nhỏ", color: "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300" },
};

const EVEN_ODD_LABELS: Record<string, { label: string; color: string }> = {
  even: { label: "Chẵn", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  even1112: {
    label: "Chẵn 11-12",
    color: "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300",
  },
  evenOddDraw: {
    label: "Hoà C/L",
    color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  },
  odd1112: {
    label: "Lẻ 11-12",
    color: "bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300",
  },
  odd: { label: "Lẻ", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
};

export function KenoSideBetBadge({ type, bet, className }: KenoSideBetBadgeProps) {
  const labels = type === "bigSmall" ? BIG_SMALL_LABELS : EVEN_ODD_LABELS;
  const config = labels[bet] ?? { label: bet, color: "bg-muted text-muted-foreground" };

  return (
    <span
      className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", config.color, className)}
    >
      {config.label}
    </span>
  );
}
