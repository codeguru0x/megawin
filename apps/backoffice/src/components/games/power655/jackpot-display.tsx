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
          className={cn(
            "rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-900/50 dark:text-red-300",
            size === "sm" && "text-[9px]",
          )}
        >
          Jackpot 1
        </span>
        <span
          className={cn(
            "font-bold text-red-600 tabular-nums dark:text-red-400",
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
          className={cn(
            "rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
            size === "sm" && "text-[9px]",
          )}
        >
          Jackpot 2
        </span>
        <span
          className={cn(
            "font-bold text-blue-600 tabular-nums dark:text-blue-400",
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
