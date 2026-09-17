"use client";

import { formatVND } from "@megawin/shared/utils";

import { cn } from "@/lib/utils";

interface DualJackpotDisplayProps {
  jp1Amount: number;
  jp2Amount: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function DualJackpotDisplay({ jp1Amount, jp2Amount, size = "md", className }: DualJackpotDisplayProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-center gap-2">
        <span
          className={cn("bg-loss text-loss rounded-md px-1.5 py-0.5 text-xs font-bold", size === "sm" && "text-xs")}
        >
          Jackpot 1
        </span>
        <span
          className={cn(
            "text-loss font-bold tabular-nums",
            size === "sm" && "text-sm",
            size === "md" && "text-lg",
            size === "lg" && "text-3xl",
          )}
        >
          {formatVND(jp1Amount)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={cn("bg-info text-info rounded-md px-1.5 py-0.5 text-xs font-bold", size === "sm" && "text-xs")}
        >
          Jackpot 2
        </span>
        <span
          className={cn(
            "text-info font-bold tabular-nums",
            size === "sm" && "text-sm",
            size === "md" && "text-lg",
            size === "lg" && "text-3xl",
          )}
        >
          {formatVND(jp2Amount)}
        </span>
      </div>
    </div>
  );
}

export { formatVND };
