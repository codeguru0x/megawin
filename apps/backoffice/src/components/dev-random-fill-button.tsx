"use client";

import { Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";

function generateUniqueRandomNumbers(
  count: number,
  min: number,
  max: number
): number[] {
  const pool = Array.from({ length: max - min + 1 }, (_, i) => i + min);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
  }
  return pool.slice(0, count);
}

function generateRandomNumber(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function DevRandomFillButton({
  onFill,
  className,
}: {
  onFill: () => void;
  className?: string;
}) {
  if (process.env.NODE_ENV === "production") return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onFill}
      className={className}
    >
      <Shuffle className="mr-1.5 size-3.5" />
      Ngẫu nhiên
    </Button>
  );
}

export { generateUniqueRandomNumbers, generateRandomNumber };
