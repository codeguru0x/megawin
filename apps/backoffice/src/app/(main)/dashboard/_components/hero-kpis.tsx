"use client";

import {
  TrendingDown,
  TrendingUp,
  Minus,
  CircleDollarSign,
  BarChart3,
  Wallet,
  Ticket,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatVND, formatNumber, formatPercent } from "@megawin/shared/utils/number";
import { calcTrendPercent, type DashboardDayKpis } from "../_lib/compute";
import { HeroKpisSkeleton } from "./skeletons";

interface HeroKpisProps {
  currentKpis: DashboardDayKpis;
  compareKpis?: DashboardDayKpis;
  /** Khi true: đang xem ngày đã đóng → hiển thị trend % */
  showTrend: boolean;
  isLoading: boolean;
}

// ─── Trend badge ──────────────────────────────────────────────────────────────

function TrendBadge({ value }: { value: number }) {
  const isPositive = value >= 0;
  const Icon = isPositive ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "flex items-center gap-1 text-xs font-semibold",
        isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
      )}
    >
      <Icon className="size-3" />
      {isPositive ? "+" : ""}
      {formatPercent(value)}
    </span>
  );
}

// ─── KPI Card (pattern giống JackpotKpiCards trong jackpot-overview-section) ──

interface KpiCardProps {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  trend: number | null;
  showTrend: boolean;
  valueClassName?: string;
  subText?: string;
}

function KpiCard({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
  trend,
  showTrend,
  valueClassName,
  subText,
}: KpiCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", iconBg)}>
        <Icon className={cn("size-5", iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <p className={cn("text-lg font-bold tabular-nums text-foreground", valueClassName)}>
          {value}
        </p>
        <div className="mt-0.5 h-4 flex items-center">
          {showTrend ? (
            trend != null ? (
              <TrendBadge value={trend} />
            ) : (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Minus className="size-3" /> Chưa có dữ liệu
              </span>
            )
          ) : (
            subText && <span className="text-[11px] text-muted-foreground">{subText}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Zone 1 — Hero KPI strip (5 cards ngang).
 *
 * Pattern giống KpiCard trong jackpot-overview-section:
 * rounded-xl border bg-card p-4, icon với bg coloured, text-lg font-bold tabular-nums.
 * Trend % chỉ render khi showTrend = true (ngày đã đóng).
 */
export function HeroKpis({ currentKpis, compareKpis, showTrend, isLoading }: HeroKpisProps) {
  if (isLoading) return <HeroKpisSkeleton />;

  const stakeTrend = calcTrendPercent(currentKpis.totalStake, compareKpis?.totalStake);
  const ggrTrend = calcTrendPercent(currentKpis.totalGgr, compareKpis?.totalGgr);
  const profitTrend = calcTrendPercent(currentKpis.totalProfit, compareKpis?.totalProfit);
  const entriesTrend = calcTrendPercent(currentKpis.totalEntries, compareKpis?.totalEntries);
  const playersTrend = calcTrendPercent(currentKpis.totalPlayers, compareKpis?.totalPlayers);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <KpiCard
        icon={CircleDollarSign}
        iconBg="bg-blue-100 dark:bg-blue-900/50"
        iconColor="text-blue-600 dark:text-blue-400"
        label="Doanh thu"
        value={formatVND(currentKpis.totalStake)}
        trend={stakeTrend}
        showTrend={showTrend}
        subText="Hôm nay"
      />
      <KpiCard
        icon={BarChart3}
        iconBg="bg-violet-100 dark:bg-violet-900/50"
        iconColor="text-violet-600 dark:text-violet-400"
        label="GGR"
        value={formatVND(currentKpis.totalGgr)}
        trend={ggrTrend}
        showTrend={showTrend}
        valueClassName={currentKpis.totalGgr < 0 ? "text-red-600 dark:text-red-400" : undefined}
        subText="Hôm nay"
      />
      <KpiCard
        icon={Wallet}
        iconBg="bg-emerald-100 dark:bg-emerald-900/50"
        iconColor="text-emerald-600 dark:text-emerald-400"
        label="Lợi nhuận"
        value={formatVND(currentKpis.totalProfit)}
        trend={profitTrend}
        showTrend={showTrend}
        valueClassName={currentKpis.totalProfit < 0 ? "text-red-600 dark:text-red-400" : undefined}
        subText="Hôm nay"
      />
      <KpiCard
        icon={Ticket}
        iconBg="bg-amber-100 dark:bg-amber-900/50"
        iconColor="text-amber-600 dark:text-amber-400"
        label="Số vé"
        value={formatNumber(currentKpis.totalEntries)}
        trend={entriesTrend}
        showTrend={showTrend}
        subText="Hôm nay"
      />
      <KpiCard
        icon={Users}
        iconBg="bg-rose-100 dark:bg-rose-900/50"
        iconColor="text-rose-600 dark:text-rose-400"
        label="Người chơi"
        value={formatNumber(currentKpis.totalPlayers)}
        trend={playersTrend}
        showTrend={showTrend}
        subText="Hôm nay"
      />
    </div>
  );
}
