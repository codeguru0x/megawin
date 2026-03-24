"use client";

import { cn } from "@/lib/utils";
import { formatVNDCompact } from "@megawin/shared/utils";

interface JackpotDisplayProps {
  amount: number;
  size?: "sm" | "md" | "lg";
  className?: string;
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
        {formatVNDCompact(amount)}
      </span>
    </div>
  );
}

export { formatVNDCompact as formatVND };
