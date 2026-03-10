"use client";

import { cn } from "@/lib/utils";
import {
  LOTTO_MAIN_BG,
  LOTTO_MUTED_BG,
  LOTTO_NUMBER_SIZE,
  LOTTO_SPECIAL_BG,
  type LottoNumberSize,
} from "./lotto-number-tokens";

interface LottoNumberBallProps {
  number: string;
  variant?: "main" | "special";
  size?: LottoNumberSize;
  muted?: boolean;
}

export function LottoNumberBall({
  number,
  variant = "main",
  size = "md",
  muted = false,
}: LottoNumberBallProps) {
  const { sizeClass, textClass } = LOTTO_NUMBER_SIZE[size];
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-bold tabular-nums select-none leading-none shrink-0",
        sizeClass,
        textClass,
        muted ? LOTTO_MUTED_BG : variant === "main" ? LOTTO_MAIN_BG : LOTTO_SPECIAL_BG,
      )}
    >
      {number}
    </span>
  );
}
