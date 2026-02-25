"use client";

import { cn } from "@/lib/utils";

interface KenoNumberBallProps {
  number: number;
  variant?: "default" | "matched" | "big" | "small";
  size?: "sm" | "md" | "lg";
}

export function KenoNumberBall({
  number,
  variant = "default",
  size = "md",
}: KenoNumberBallProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-bold tabular-nums select-none",
        variant === "default" && "bg-sky-500 text-white",
        variant === "matched" && "bg-emerald-500 text-white ring-2 ring-emerald-300",
        variant === "big" && "bg-orange-500 text-white",
        variant === "small" && "bg-teal-500 text-white",
        size === "sm" && "size-7 text-xs",
        size === "md" && "size-9 text-sm",
        size === "lg" && "size-11 text-base"
      )}
    >
      {String(number).padStart(2, "0")}
    </span>
  );
}
