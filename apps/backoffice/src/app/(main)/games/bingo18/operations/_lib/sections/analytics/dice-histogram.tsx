"use client";

/**
 * Bingo 18 – Dice Histogram
 *
 * Tần suất 6 mặt xúc xắc (1-6) từ boards cơ bản (singleNum + doubleMatch).
 * Hiển thị dạng bar chart + top side-bet combos + tenant breakdown.
 * Thay thế NumberHeatmap của Keno.
 */

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@megawin/shared/utils";
import { Dice5, TrendingUp } from "lucide-react";
import type { TopComboItem } from "../../use-operations";
import type { TenantRow } from "../../types";

// ─── Single Dice Face ─────────────────────────────────────────────────────────

/** Màu theo giá trị mặt xúc xắc — gradient từ nhạt (1) đến đậm (6) */
const DICE_COLORS: Record<number, { bar: string; badge: string; bg: string }> = {
  1: {
    bar: "bg-amber-300 dark:bg-amber-700",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/30",
  },
  2: {
    bar: "bg-amber-400 dark:bg-amber-600",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/30",
  },
  3: {
    bar: "bg-orange-400 dark:bg-orange-600",
    badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-950/30",
  },
  4: {
    bar: "bg-orange-500 dark:bg-orange-500",
    badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-950/30",
  },
  5: {
    bar: "bg-red-400 dark:bg-red-500",
    badge: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-950/30",
  },
  6: {
    bar: "bg-red-500 dark:bg-red-400",
    badge: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-950/30",
  },
};

// ─── Tenant Breakdown (inline, giống Power/Mega pattern) ─────────────────────

function TenantBreakdown({ tenants }: { tenants: TenantRow[] }) {
  if (tenants.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-primary/50 shrink-0" />
        Đại lý
      </p>
      <div className="space-y-1">
        {tenants.map((t) => (
          <div
            key={t.tenantId}
            className="grid items-center gap-x-3 rounded-lg border border-border/40 bg-muted/10 px-3 py-2"
            style={{ gridTemplateColumns: "6rem 5rem 5rem 5.5rem 1fr" }}
          >
            <span className="text-xs font-medium truncate">{t.tenantId}</span>
            <span className="text-[11px] tabular-nums text-muted-foreground text-right">
              {formatNumber(t.entries)} ent
            </span>
            <span className="text-[11px] tabular-nums text-muted-foreground text-right">
              {formatNumber(t.players)} ng
            </span>
            <span className="text-xs tabular-nums font-semibold text-foreground text-right">
              {formatNumber(t.revenue)}
            </span>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-amber-500/60 transition-all"
                  style={{ width: `${t.pct}%` }}
                />
              </div>
              <span className="text-[11px] font-medium text-muted-foreground tabular-nums w-8 text-right shrink-0">
                {t.pct.toFixed(0)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Dice Histogram ───────────────────────────────────────────────────────────

interface DiceFreqItem {
  /** Mặt xúc xắc (1-6). */
  diceValue: number;
  /** Số lần xuất hiện trong boards cược. */
  count: number;
  entries: number;
}

export function DiceHistogram({
  diceFreq,
  combos,
  tenants,
}: {
  diceFreq: DiceFreqItem[];
  combos: TopComboItem[];
  tenants?: TenantRow[];
}) {
  const maxCount = Math.max(...diceFreq.map((d) => d.count), 1);

  return (
    <Card className="shadow-sm">
      <CardContent className="pt-4 space-y-4">
        <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          {/* Histogram */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex size-7 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/50 shrink-0">
                <Dice5 className="size-3.5 text-amber-600 dark:text-amber-400" />
              </div>
              <span className="text-sm font-semibold">Tần suất xúc xắc</span>
            </div>
            {diceFreq.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Chưa có dữ liệu</p>
            ) : (
              <div className="flex items-end justify-around gap-3 h-40 px-2">
                {diceFreq.map((d) => {
                  const colors = DICE_COLORS[d.diceValue] ?? DICE_COLORS[1]!;
                  const barHeightPct = maxCount > 0 ? (d.count / maxCount) * 100 : 0;
                  return (
                    <div
                      key={d.diceValue}
                      className="flex flex-col items-center gap-1 flex-1 h-full group"
                    >
                      <div className="flex-1 flex flex-col justify-end w-full">
                        <div
                          className="relative w-full flex flex-col justify-end"
                          style={{ height: "100%" }}
                        >
                          <span
                            className={cn(
                              "text-[11px] font-semibold tabular-nums text-center mb-1 transition-opacity",
                              d.count === 0 ? "opacity-0" : "opacity-100",
                            )}
                          >
                            {formatNumber(d.count)}
                          </span>
                          <div
                            className={cn(
                              "w-full rounded-t-md transition-all duration-700",
                              colors.bar,
                            )}
                            style={{ height: `${Math.max(barHeightPct, d.count > 0 ? 4 : 0)}%` }}
                          />
                        </div>
                      </div>
                      <div
                        className={cn(
                          "flex size-8 items-center justify-center rounded-lg text-sm font-bold tabular-nums shrink-0",
                          colors.badge,
                        )}
                      >
                        {d.diceValue}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Top Side-bet Combos */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex size-7 items-center justify-center rounded-lg bg-cyan-100 dark:bg-cyan-900/50 shrink-0">
                <TrendingUp className="size-3.5 text-cyan-600 dark:text-cyan-400" />
              </div>
              <span className="text-sm font-semibold">Top Side Bets</span>
            </div>
            {combos.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Chưa có dữ liệu</p>
            ) : (
              <div className="space-y-1">
                {combos.slice(0, 10).map((combo, i) => {
                  const label =
                    combo.playType === "sumTotal"
                      ? `Tổng ${combo.sum ?? "?"}`
                      : `Lớn/Nhỏ — ${combo.bet ?? "?"}`;
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-2 py-1.5 px-2 -mx-2 rounded-lg hover:bg-muted/30 transition-colors"
                    >
                      <span className="text-[10px] text-muted-foreground/40 w-4 tabular-nums shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-xs font-medium flex-1 truncate">{label}</span>
                      <span className="text-xs tabular-nums font-semibold text-cyan-700 dark:text-cyan-400 shrink-0">
                        {formatNumber(combo.count)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {tenants && tenants.length > 0 && (
          <div className="border-t pt-3">
            <TenantBreakdown tenants={tenants} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
