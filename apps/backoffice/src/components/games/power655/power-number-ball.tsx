"use client";

import { cn } from "@/lib/utils";

interface PowerNumberBallProps {
  number: number;
  variant?: "main" | "bonus";
  size?: "sm" | "md" | "lg";
}

export function PowerNumberBall({
  number,
  variant = "main",
  size = "md",
}: PowerNumberBallProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-bold tabular-nums select-none",
        variant === "main"
          ? "bg-red-500 text-white"
          : "bg-blue-600 text-white",
        size === "sm" && "size-7 text-xs",
        size === "md" && "size-9 text-sm",
        size === "lg" && "size-11 text-base"
      )}
    >
      {String(number).padStart(2, "0")}
    </span>
  );
}
