"use client";

/**
 * Bingo 18 – SumTotal Bar (16 cột 3→18) + Side Bet Card (3 hướng Lớn/Hòa/Nhỏ)
 *
 * SumTotalBar là panel concentration CHÍNH của Bingo 18 (thay "Bộ số phổ biến" Keno):
 * bucket 3/18 nhân ×120 → viền đỏ nhạt; vượt `bucketConcentrationAmount` → amber + badge.
 * SideBetCard: split bar 3 đoạn theo amount; hướng ≥ `sidebetSkewPct` → amber + badge
 * "lệch X%". Ngưỡng từ `snapshot.thresholds` — KHÔNG hardcode (fallback loading ở caller).
 * Chú thích xác suất nền đối xứng (Nhỏ 37,50% · Hòa 25,00% · Lớn 37,50%).
 */

import { memo } from "react";

import { formatCurrency, formatNumber } from "@megawin/shared/utils";
import { Scale, Sigma } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { SideBetSplit, SumBarItem } from "../../types";

// ─── SumTotal Bar ─────────────────────────────────────────────────────────────

/** 1 cột tổng — memo props primitives: poll mới chỉ re-render cột có số đổi. */
const SumBarColumn = memo(function SumBarColumn({
  sum,
  amount,
  sets,
  heightPct,
  isHighMultiplier,
  overThreshold,
}: {
  sum: number;
  amount: number;
  sets: number;
  heightPct: number;
  isHighMultiplier: boolean;
  overThreshold: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex h-full flex-1 cursor-help flex-col items-center gap-1">
          <div className="flex w-full flex-1 flex-col justify-end">
            <span
              className={cn(
                "mb-0.5 text-center text-[10px] font-semibold tabular-nums",
                amount === 0 ? "opacity-0" : "opacity-100",
                overThreshold ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
              )}
            >
              {formatCurrency(amount)}
            </span>
            <div
              className={cn(
                "w-full rounded-t-md transition-all duration-500",
                overThreshold
                  ? "bg-amber-500"
                  : isHighMultiplier
                    ? "bg-red-400/80 dark:bg-red-500/70"
                    : "bg-cyan-400/80 dark:bg-cyan-600/70",
              )}
              style={{ height: `${Math.max(heightPct, amount > 0 ? 4 : 0)}%` }}
            />
          </div>
          <span
            className={cn(
              "flex h-6 w-full items-center justify-center rounded-md text-[11px] font-bold tabular-nums",
              isHighMultiplier
                ? "bg-red-100 text-red-700 ring-1 ring-red-300/60 dark:bg-red-900/50 dark:text-red-300 dark:ring-red-800/50"
                : "bg-muted text-muted-foreground",
            )}
          >
            {sum}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs tabular-nums">
        Tổng {sum}
        {isHighMultiplier ? " (×120 — cửa nhân cao)" : ""}: {formatNumber(amount)} VND · {formatNumber(sets)} bộ
      </TooltipContent>
    </Tooltip>
  );
});

export function SumTotalBar({
  bars,
  concentrationThreshold,
}: {
  bars: SumBarItem[];
  /** Ngưỡng tiền dồn 1 bucket nhân cao (VND) từ `snapshot.thresholds`. */
  concentrationThreshold: number;
}) {
  const maxAmount = Math.max(...bars.map((b) => b.amount), 1);

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="px-5 pb-1 pt-4">
        <div className="flex items-center gap-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-cyan-100 dark:bg-cyan-900/50">
            <Sigma className="size-3.5 text-cyan-600 dark:text-cyan-400" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Phân bổ Cộng tổng (3–18)</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Tổng 3/18 trả ×120 (viền đỏ) — vượt {formatNumber(concentrationThreshold)} VND → cảnh báo dồn cửa
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4 pt-2">
        <div className="flex h-36 items-end gap-1.5">
          {bars.map((b) => (
            <SumBarColumn
              key={b.sum}
              sum={b.sum}
              amount={b.amount}
              sets={b.sets}
              heightPct={(b.amount / maxAmount) * 100}
              isHighMultiplier={b.isHighMultiplier}
              overThreshold={b.isHighMultiplier && b.amount >= concentrationThreshold}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Side Bet Card (3 hướng) ──────────────────────────────────────────────────

export function SideBetCard({
  split,
  skewPct,
}: {
  split: SideBetSplit;
  /** Ngưỡng % lệch từ `snapshot.thresholds`. */
  skewPct: number;
}) {
  const dirs = [
    { key: "small", label: split.small.label, amount: split.small.amount, base: "37,50%" },
    { key: "draw", label: split.draw.label, amount: split.draw.amount, base: "25,00%" },
    { key: "big", label: split.big.label, amount: split.big.amount, base: "37,50%" },
  ] as const;

  const pctOf = (amount: number) => (split.total > 0 ? (amount / split.total) * 100 : 0);
  let top: (typeof dirs)[number] = dirs[0];
  for (const d of dirs) if (d.amount > top.amount) top = d;
  const topPct = pctOf(top.amount);
  const skewed = split.total > 0 && topPct >= skewPct;

  const SEGMENT_COLORS: Record<(typeof dirs)[number]["key"], string> = {
    small: "bg-teal-500/80",
    draw: "bg-slate-400/80",
    big: "bg-sky-500/80",
  };

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="px-5 pb-1 pt-4">
        <div className="flex items-center gap-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/50">
            <Scale className="size-3.5 text-teal-600 dark:text-teal-400" />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-sm font-semibold">Lớn / Hòa / Nhỏ</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Xác suất nền KHÔNG đối xứng: Nhỏ 49% · Hòa 25% · Lớn 26%
            </p>
          </div>
          {skewed && (
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              Lệch {Math.round(topPct)}% → {top.label}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-5 pb-4 pt-2">
        {/* Split bar 3 đoạn */}
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
          {dirs.map((d) => {
            const pct = pctOf(d.amount);
            const isTopSkewed = skewed && d.key === top.key;
            return (
              <div
                key={d.key}
                className={cn("h-full transition-all", isTopSkewed ? "bg-amber-500" : SEGMENT_COLORS[d.key])}
                style={{ width: `${pct}%` }}
              />
            );
          })}
        </div>
        {/* 3 hướng: nhãn + tiền + % + xác suất nền */}
        <div className="grid grid-cols-3 gap-2">
          {dirs.map((d) => {
            const pct = pctOf(d.amount);
            const isTopSkewed = skewed && d.key === top.key;
            return (
              <div
                key={d.key}
                className={cn(
                  "rounded-lg border px-2.5 py-2",
                  isTopSkewed
                    ? "border-amber-300/70 bg-amber-50/60 dark:border-amber-800/50 dark:bg-amber-950/20"
                    : "border-border/50 bg-muted/10",
                )}
              >
                <p className="text-xs font-medium">{d.label}</p>
                <p className="text-sm font-bold tabular-nums leading-tight">{formatNumber(d.amount)}</p>
                <p className="text-[10px] tabular-nums text-muted-foreground">
                  {Math.round(pct)}% · nền {d.base}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
