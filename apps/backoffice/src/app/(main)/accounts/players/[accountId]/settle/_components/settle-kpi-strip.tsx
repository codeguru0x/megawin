"use client";

import type { PlayerOverviewResult } from "@megawin/game-core-application/repos";
import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { formatNumber, formatVNDCompact } from "@megawin/shared/utils";
import { Building2, DollarSign, Receipt, TrendingDown, TrendingUp } from "lucide-react";

import { formatPayoutRatio, getNetProfitColor, getPayoutRatioColor } from "@/components/reports/payout-ratio";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Badge background tương ứng ngưỡng payout ratio. */
function payoutBadgeClass(ratio: number): string {
  const color = getPayoutRatioColor(ratio);
  if (color === "text-loss") {
    return "bg-loss text-loss";
  }
  if (color === "text-warning") {
    return "bg-warning text-warning";
  }
  return "bg-profit text-profit";
}

/** Badge background cho win rate (luôn dùng tông xanh dương nhẹ). */
const WIN_RATE_BADGE = "bg-info text-info";

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
          <Skeleton key={i} className="h-19 rounded-xl" />
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
        iconBg="bg-info"
        iconColor="text-info"
        label="Tổng đơn cược"
        value={formatNumber(totalEntryCount)}
        subNode={
          <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
            Thắng {formatNumber(totalWinCount)}
            <span
              className={cn("inline-flex items-center rounded px-1 py-0.5 font-semibold tabular-nums", WIN_RATE_BADGE)}
            >
              {formatNumber(winRate, { decimals: 1 })}%
            </span>
          </span>
        }
      />

      {/* Tiền cược */}
      <KpiCard
        icon={DollarSign}
        iconBg="bg-profit"
        iconColor="text-profit"
        label={REPORT_COLUMN_LABELS.totalStake}
        value={formatVNDCompact(totalStake)}
        sub={`TB ${formatNumber(avgBet)} ₫/đơn`}
      />

      {/* Trả thưởng + Tỷ lệ TT */}
      <KpiCard
        icon={TrendingDown}
        iconBg={payoutColor ? "bg-loss" : "bg-warning"}
        iconColor={payoutColor ? "text-loss" : "text-warning"}
        label={REPORT_COLUMN_LABELS.totalPayout}
        value={formatVNDCompact(totalPayout)}
        subNode={
          <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
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
        iconBg="bg-info"
        iconColor="text-info"
        label={REPORT_COLUMN_LABELS.ggr}
        value={formatVNDCompact(ggr)}
      />

      {/* Hoa hồng đại lý */}
      <KpiCard
        icon={Building2}
        iconBg="bg-warning"
        iconColor="text-warning"
        label={REPORT_COLUMN_LABELS.totalCommission}
        value={formatVNDCompact(totalCommission)}
      />

      {/* Lợi nhuận ròng */}
      <KpiCard
        icon={TrendingUp}
        iconBg={netProfit < 0 ? "bg-loss" : "bg-game-max3d"}
        iconColor={netProfit < 0 ? "text-loss" : "text-game-max3d"}
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

function KpiCard({ icon: Icon, iconBg, iconColor, label, value, valueClass, sub, subNode }: KpiCardProps) {
  return (
    <div className="bg-card flex items-center gap-3 rounded-xl border p-4 shadow-sm">
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", iconBg)}>
        <Icon className={cn("size-5", iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
        <p className={cn("text-foreground text-lg font-bold tabular-nums", valueClass ?? "")}>{value}</p>
        {subNode}
        {sub && <p className="text-muted-foreground truncate text-xs">{sub}</p>}
      </div>
    </div>
  );
}
