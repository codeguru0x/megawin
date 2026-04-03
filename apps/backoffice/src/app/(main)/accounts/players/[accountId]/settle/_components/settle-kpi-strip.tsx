"use client";

import { Receipt, DollarSign, TrendingDown, TrendingUp, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatVNDCompact, formatNumber } from "@megawin/shared/utils";
import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getNetProfitColor,
  getPayoutRatioColor,
  formatPayoutRatio,
} from "@/components/reports/payout-ratio";

import type { PlayerOverviewResult } from "@megawin/game-core-application/repos";

/** Badge background tương ứng ngưỡng payout ratio. */
function payoutBadgeClass(ratio: number): string {
  const color = getPayoutRatioColor(ratio);
  if (color === "text-loss") return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400";
  if (color === "text-warning")
    return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400";
  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400";
}

/** Badge background cho win rate (luôn dùng tông xanh dương nhẹ). */
const WIN_RATE_BADGE = "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400";

interface SettleKpiStripProps {
  data: PlayerOverviewResult | undefined;
  isLoading: boolean;
}

/**
 * KPI strip 6 cards — luôn hiện cross-game totals (Phương án A).
 *
 * 1. Tổng đơn cược (entryCount + settled sub)
 * 2. Tiền cược (totalStake)
 * 3. Trả thưởng (totalPayout + payoutRatio badge + winRate)
 * 4. Doanh thu thuần (ggr)
 * 5. Hoa hồng đại lý (totalCommission)
 * 6. Lợi nhuận ròng (netProfit)
 */
export function SettleKpiStrip({ data, isLoading }: SettleKpiStripProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[76px] rounded-xl" />
        ))}
      </div>
    );
  }

  const totalEntryCount = data?.totalEntryCount ?? 0;
  const totalWinCount = data?.totalWinCount ?? 0;
  const totalStake = data?.totalStake ?? 0;
  const totalPayout = data?.totalPayout ?? 0;
  const ggr = data?.ggr ?? 0;
  const totalCommission = data?.totalCommission ?? 0;
  const netProfit = data?.netProfit ?? 0;

  const payoutRatio = totalStake > 0 ? totalPayout / totalStake : 0;
  const winRate = totalEntryCount > 0 ? (totalWinCount / totalEntryCount) * 100 : 0;
  const avgBet = totalEntryCount > 0 ? Math.round(totalStake / totalEntryCount) : 0;
  const payoutColor = getPayoutRatioColor(payoutRatio);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {/* Tổng đơn cược — tất cả entries trong báo cáo settle đều đã kết sổ */}
      <KpiCard
        icon={Receipt}
        iconBg="bg-blue-100 dark:bg-blue-900/50"
        iconColor="text-blue-600 dark:text-blue-400"
        label="Tổng đơn cược"
        value={formatNumber(totalEntryCount)}
        subNode={
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            Thắng {formatNumber(totalWinCount)}
            <span
              className={cn(
                "inline-flex items-center rounded px-1 py-0.5 font-semibold tabular-nums",
                WIN_RATE_BADGE,
              )}
            >
              {formatNumber(winRate, { decimals: 1 })}%
            </span>
          </span>
        }
      />

      {/* Tiền cược */}
      <KpiCard
        icon={DollarSign}
        iconBg="bg-emerald-100 dark:bg-emerald-900/50"
        iconColor="text-emerald-600 dark:text-emerald-400"
        label={REPORT_COLUMN_LABELS.totalStake}
        value={formatVNDCompact(totalStake)}
        sub={`TB ${formatNumber(avgBet)} ₫/đơn`}
      />

      {/* Trả thưởng + Tỷ lệ TT */}
      <KpiCard
        icon={TrendingDown}
        iconBg={
          payoutColor ? "bg-red-100 dark:bg-red-900/50" : "bg-orange-100 dark:bg-orange-900/50"
        }
        iconColor={
          payoutColor ? "text-red-600 dark:text-red-400" : "text-orange-600 dark:text-orange-400"
        }
        label={REPORT_COLUMN_LABELS.totalPayout}
        value={formatVNDCompact(totalPayout)}
        subNode={
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            Tỷ lệ TT{" "}
            <span
              className={cn(
                "inline-flex items-center rounded px-1 py-0.5 font-semibold tabular-nums",
                payoutBadgeClass(payoutRatio),
              )}
            >
              {formatPayoutRatio(payoutRatio)}
            </span>
          </span>
        }
      />

      {/* Doanh thu thuần */}
      <KpiCard
        icon={TrendingUp}
        iconBg="bg-blue-100 dark:bg-blue-900/50"
        iconColor="text-blue-600 dark:text-blue-400"
        label={REPORT_COLUMN_LABELS.ggr}
        value={formatVNDCompact(ggr)}
      />

      {/* Hoa hồng đại lý */}
      <KpiCard
        icon={Building2}
        iconBg="bg-amber-100 dark:bg-amber-900/50"
        iconColor="text-amber-600 dark:text-amber-400"
        label={REPORT_COLUMN_LABELS.totalCommission}
        value={formatVNDCompact(totalCommission)}
      />

      {/* Lợi nhuận ròng */}
      <KpiCard
        icon={TrendingUp}
        iconBg={
          netProfit < 0 ? "bg-red-100 dark:bg-red-900/50" : "bg-violet-100 dark:bg-violet-900/50"
        }
        iconColor={
          netProfit < 0 ? "text-red-600 dark:text-red-400" : "text-violet-600 dark:text-violet-400"
        }
        label={REPORT_COLUMN_LABELS.netProfit}
        value={formatVNDCompact(netProfit)}
        valueClass={getNetProfitColor(netProfit)}
      />
    </div>
  );
}

// ─── KPI Card primitive ───────────────────────────────────────────────────────

interface KpiCardProps {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  valueClass?: string;
  sub?: string;
  subNode?: React.ReactNode;
}

function KpiCard({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
  valueClass,
  sub,
  subNode,
}: KpiCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", iconBg)}>
        <Icon className={cn("size-5", iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={cn("text-lg font-bold tabular-nums text-foreground", valueClass ?? "")}>
          {value}
        </p>
        {subNode}
        {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}
