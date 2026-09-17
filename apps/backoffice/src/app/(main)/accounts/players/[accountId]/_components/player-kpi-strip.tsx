"use client";

import type { PlayerOverviewResult } from "@megawin/game-core-application/repos";
import { formatNumber, formatPercent, formatVNDCompact } from "@megawin/shared/utils";
import { DollarSign, Percent, Receipt, TrendingUp, Trophy } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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
      iconBg: "bg-info",
      iconColor: "text-info",
      label: "Tổng đơn cược",
      value: formatNumber(totalEntryCount),
      sub: `${formatNumber(totalSettledCount)} settled`,
    },
    {
      icon: DollarSign,
      iconBg: "bg-profit",
      iconColor: "text-profit",
      label: "Tiền cược",
      value: formatVNDCompact(totalStake),
      sub: "Chỉ tính settled",
    },
    {
      icon: TrendingUp,
      iconBg: isGgrNeg ? "bg-loss" : "bg-game-max3d",
      iconColor: isGgrNeg ? "text-loss" : "text-game-max3d",
      label: "GGR",
      value: formatVNDCompact(ggr),
      sub: isGgrNeg ? "Player trúng lớn" : "Doanh thu ròng",
      valueClass: isGgrNeg ? "text-loss" : undefined,
    },
    {
      icon: Percent,
      iconBg: "bg-warning",
      iconColor: "text-warning",
      label: "Payout %",
      value: formatPercent(payoutPct),
      sub: "Trả thưởng / Cược",
    },
    {
      icon: Trophy,
      iconBg: "bg-loss",
      iconColor: "text-loss",
      label: "Tỷ lệ thắng",
      value: formatPercent(winRate),
      sub: `${formatNumber(totalWinCount)} / ${formatNumber(totalSettledCount)} đơn`,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => (
        <div key={card.label} className="bg-card flex items-center gap-3 rounded-xl border p-4 shadow-sm">
          <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", card.iconBg)}>
            <card.icon className={cn("size-5", card.iconColor)} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground text-xs font-medium">{card.label}</p>
            <p className={cn("text-foreground text-lg font-bold tabular-nums", card.valueClass)}>{card.value}</p>
            <p className="text-muted-foreground truncate text-xs">{card.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
