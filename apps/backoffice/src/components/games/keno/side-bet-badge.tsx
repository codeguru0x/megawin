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
    color: "bg-warning text-warning",
  },
  bigSmallDraw: {
    label: "Hoà L/N",
    color: "bg-warning text-warning",
  },
  small: { label: "Nhỏ", color: "bg-game-mega645 text-game-mega645" },
};

const EVEN_ODD_LABELS: Record<string, { label: string; color: string }> = {
  even: { label: "Chẵn", color: "bg-info text-info" },
  even1112: {
    label: "Chẵn 11-12",
    color: "bg-info text-info",
  },
  evenOddDraw: {
    label: "Hoà C/L",
    color: "bg-warning text-warning",
  },
  odd1112: {
    label: "Lẻ 11-12",
    color: "bg-game-max3dpro text-game-max3dpro bg-game-max3dpro text-game-max3dpro",
  },
  odd: { label: "Lẻ", color: "bg-loss text-loss" },
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
