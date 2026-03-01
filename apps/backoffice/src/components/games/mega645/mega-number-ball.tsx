"use client";

import { cn } from "@/lib/utils";

interface MegaNumberBallProps {
  number: number;
  size?: "sm" | "md" | "lg";
}

export function MegaNumberBall({
  number,
  size = "md",
}: MegaNumberBallProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-bold tabular-nums select-none bg-orange-500 text-white",
        size === "sm" && "size-7 text-xs",
        size === "md" && "size-9 text-sm",
        size === "lg" && "size-11 text-base"
      )}
    >
      {String(number).padStart(2, "0")}
    </span>
  );
}
