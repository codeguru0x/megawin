"use client";

/**
 * Bingo 18 – Dice Board (bảng 6 ô xúc xắc, THUẦN HIỂN THỊ)
 *
 * Mỗi ô = 1 mặt 1–6: badge số · Dòng tiền (giá trị chính) · số bộ `Nx`.
 * Heat nền theo Dòng tiền (5 cấp) — guideline §3.2. KHÔNG per-number liability (§3.3).
 *
 * KHÁC guideline Keno §3 CÓ CHỦ ĐÍCH (chốt analysis §7 Q4, 30/07/2026): KHÔNG chọn số /
 * action menu / dialog tra cứu — Bingo 18 chỉ có 38 cửa cược cố định, toàn bộ đã hiển
 * thị trọn trên trang (bảng này + SumTotalBar + SideBetCard), không còn gì để "tra cứu".
 *
 * Data từ snapshot bucket (adapter `toDiceCells`) — không request riêng.
 */
import { memo } from "react";

import { formatCurrency, formatNumber } from "@megawin/shared/utils";
import { Dice5 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { DiceCellItem } from "../../types";

/** 5 cấp heat nền theo Dòng tiền: cold → hot (hot = amber, đồng bộ cross-game). */
const HEAT_LEVELS = [
  "bg-card border-border/50",
  "bg-amber-50/40 border-amber-200/40 dark:bg-amber-950/10 dark:border-amber-900/30",
  "bg-amber-50/80 border-amber-200/60 dark:bg-amber-950/25 dark:border-amber-800/40",
  "bg-amber-100/80 border-amber-300/70 dark:bg-amber-900/35 dark:border-amber-700/50",
  "bg-amber-200/80 border-amber-400/80 dark:bg-amber-800/45 dark:border-amber-600/60",
] as const;

function heatLevel(amount: number, max: number): number {
  if (amount <= 0 || max <= 0) {
    return 0;
  }
  const ratio = amount / max;
  if (ratio >= 0.85) {
    return 4;
  }
  if (ratio >= 0.6) {
    return 3;
  }
  if (ratio >= 0.35) {
    return 2;
  }
  return 1;
}

/** 1 ô xúc xắc — memo props primitives: poll mới chỉ re-render ô có số đổi. */
const DiceCell = memo(function DiceCell({
  diceValue,
  amount,
  sets,
  level,
}: {
  diceValue: number;
  amount: number;
  sets: number;
  level: number;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "relative flex cursor-help flex-col items-center justify-center rounded-xl border py-4 transition-colors",
            HEAT_LEVELS[level],
          )}
        >
          <span className="bg-foreground/5 absolute top-2 left-2 flex size-6 items-center justify-center rounded-md text-sm font-bold tabular-nums">
            {diceValue}
          </span>
          <span className="text-base leading-tight font-bold tabular-nums">
            {amount > 0 ? formatCurrency(amount) : "—"}
          </span>
          <span className="text-muted-foreground text-2xs tabular-nums">{formatNumber(sets)}x</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="tabular-nums">
        Số {diceValue}: {formatNumber(amount)} VND · {formatNumber(sets)} bộ (Một số + Hai số trùng + Ba số cụ thể)
      </TooltipContent>
    </Tooltip>
  );
});

export function DiceBoard({ cells }: { cells: DiceCellItem[] }) {
  const maxAmount = Math.max(...cells.map((c) => c.amount), 0);

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/50">
            <Dice5 className="size-3.5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Dòng tiền theo mặt xúc xắc</CardTitle>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Một số + Hai số trùng + Ba số cụ thể · heat theo tiền cược
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pt-1 pb-4">
        <div className="grid grid-cols-3 gap-2 @[28rem]/main:grid-cols-6">
          {cells.map((c) => (
            <DiceCell
              key={c.diceValue}
              diceValue={c.diceValue}
              amount={c.amount}
              sets={c.sets}
              level={heatLevel(c.amount, maxAmount)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
