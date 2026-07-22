"use client";

import { Receipt, DollarSign, TrendingUp, Percent, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatVNDCompact, formatPercent, formatNumber } from "@megawin/shared/utils";

import { Skeleton } from "@/components/ui/skeleton";

import type { PlayerOverviewResult } from "@megawin/game-core-application/repos";

interface PlayerKpiStripProps {
  data: PlayerOverviewResult | undefined;
  isLoading: boolean;
}

/**
 * KPI strip 5 card tổng quan tài chính của player trong date range.
 *
 * Layout: horizontal icon + value, pattern chuẩn theo frontend-dev rule §1.2a.
 * Tiền dùng formatVNDCompact cho KPI cards.
 * Tỷ lệ dùng formatPercent.
 */
export function PlayerKpiStrip({ data, isLoading }: PlayerKpiStripProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-18 rounded-xl" />
        ))}
      </div>
    );
  }

  const totalEntryCount = data?.totalEntryCount ?? 0;
  const totalStake = data?.totalStake ?? 0;
  const totalPayout = data?.totalPayout ?? 0;
  const ggr = data?.ggr ?? 0;
  const totalSettledCount = data?.totalSettledCount ?? 0;
  const totalWinCount = data?.totalWinCount ?? 0;

  const payoutPct = totalStake > 0 ? (totalPayout / totalStake) * 100 : 0;
  const winRate = totalSettledCount > 0 ? (totalWinCount / totalSettledCount) * 100 : 0;
  const isGgrNeg = ggr < 0;

  const cards = [
    {
      icon: Receipt,
      iconBg: "bg-blue-100 dark:bg-blue-900/50",
      iconColor: "text-blue-600 dark:text-blue-400",
      label: "Tổng đơn cược",
      value: formatNumber(totalEntryCount),
      sub: `${formatNumber(totalSettledCount)} settled`,
    },
    {
      icon: DollarSign,
      iconBg: "bg-emerald-100 dark:bg-emerald-900/50",
      iconColor: "text-emerald-600 dark:text-emerald-400",
      label: "Tiền cược",
      value: formatVNDCompact(totalStake),
      sub: "Chỉ tính settled",
    },
    {
      icon: TrendingUp,
      iconBg: isGgrNeg ? "bg-rose-100 dark:bg-rose-900/50" : "bg-violet-100 dark:bg-violet-900/50",
      iconColor: isGgrNeg
        ? "text-rose-600 dark:text-rose-400"
        : "text-violet-600 dark:text-violet-400",
      label: "GGR",
      value: formatVNDCompact(ggr),
      sub: isGgrNeg ? "Player trúng lớn" : "Doanh thu ròng",
      valueClass: isGgrNeg ? "text-rose-600 dark:text-rose-400" : undefined,
    },
    {
      icon: Percent,
      iconBg: "bg-amber-100 dark:bg-amber-900/50",
      iconColor: "text-amber-600 dark:text-amber-400",
      label: "Payout %",
      value: formatPercent(payoutPct),
      sub: "Trả thưởng / Cược",
    },
    {
      icon: Trophy,
      iconBg: "bg-rose-100 dark:bg-rose-900/50",
      iconColor: "text-rose-600 dark:text-rose-400",
      label: "Tỷ lệ thắng",
      value: formatPercent(winRate),
      sub: `${formatNumber(totalWinCount)} / ${formatNumber(totalSettledCount)} đơn`,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => (
        <div
          key={card.label}
          className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm"
        >
          <div
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-lg",
              card.iconBg,
            )}
          >
            <card.icon className={cn("size-5", card.iconColor)} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-muted-foreground">{card.label}</p>
            <p className={cn("text-lg font-bold tabular-nums text-foreground", card.valueClass)}>
              {card.value}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">{card.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
