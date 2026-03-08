"use client";

import { cn } from "@/lib/utils";

interface LottoNumberBallProps {
  number: string;
  variant?: "main" | "special";
  size?: "sm" | "md" | "lg";
}

export function LottoNumberBall({ number, variant = "main", size = "md" }: LottoNumberBallProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-bold tabular-nums select-none",
        variant === "main" ? "bg-amber-500 text-white" : "bg-violet-600 text-white",
        size === "sm" && "size-7 text-xs",
        size === "md" && "size-9 text-sm",
        size === "lg" && "size-11 text-base",
      )}
    >
      {number}
    </span>
  );
}
