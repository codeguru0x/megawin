"use client";

import { CalendarRange, DollarSign, Percent, TrendingDown, TrendingUp } from "lucide-react";
import { formatVNDCompact, formatNumber } from "@megawin/shared/utils";
import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import {
  getPayoutRatioColor,
  getNetProfitColor,
  PayoutRatioKpiBadge,
} from "@/components/reports/payout-ratio";
import { KpiCard } from "./kpi-card";

/**
 * Tập hợp số liệu KPI tối thiểu cho per-game financial reports.
 * Tất cả 7 game đều có các fields này.
 */
export interface GameDrawKpiData {
  drawCount: number;
  entryCount: number;
  totalStake: number;
  totalPayout: number;
  ggr: number;
  totalCommission: number;
  netProfit: number;
}

export interface GameDrawKpiStripProps {
  data: GameDrawKpiData;
  /**
   * Sub text cho card "Tổng kỳ quay".
   * VD: "kỳ đã settle · ~120 kỳ/ngày" cho Keno.
   * Mặc định: "kỳ đã settle"
   */
  drawCountSub?: string;
}

/**
 * Dải 6 KPI card chuẩn cho tab "Theo kỳ quay" của per-game financial reports.
 *
 * Cards: Tổng kỳ quay · Tiền cược · Trả thưởng (+ Tỷ lệ TT) · Doanh thu thuần · Hoa hồng ĐL · Lợi nhuận ròng
 *
 * Dùng ở tất cả 7 game. Game-specific data (lineCount, jackpot...) hiển thị ở bảng, không ở KPI strip.
 */
export function GameDrawKpiStrip({ data, drawCountSub = "kỳ đã settle" }: GameDrawKpiStripProps) {
  const payoutRatio = data.totalStake > 0 ? data.totalPayout / data.totalStake : 0;
  const payoutColor = getPayoutRatioColor(payoutRatio);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {/* Tổng kỳ quay */}
      <KpiCard
        icon={CalendarRange}
        iconBg="bg-indigo-100 dark:bg-indigo-900/50"
        iconColor="text-indigo-600 dark:text-indigo-400"
        label={`Tổng ${REPORT_COLUMN_LABELS.drawCount.toLowerCase()}`}
        value={formatNumber(data.drawCount)}
        sub={drawCountSub}
      />

      {/* Tiền cược */}
      <KpiCard
        icon={DollarSign}
        iconBg="bg-emerald-100 dark:bg-emerald-900/50"
        iconColor="text-emerald-600 dark:text-emerald-400"
        label={REPORT_COLUMN_LABELS.totalStake}
        value={formatVNDCompact(data.totalStake)}
        sub={`${formatNumber(data.entryCount)} lượt cược`}
      />

      {/* Trả thưởng + Tỷ lệ TT — gộp 1 card */}
      <KpiCard
        icon={TrendingDown}
        iconBg={payoutColor ? "bg-red-100 dark:bg-red-900/50" : "bg-orange-100 dark:bg-orange-900/50"}
        iconColor={payoutColor ? "text-red-600 dark:text-red-400" : "text-orange-600 dark:text-orange-400"}
        label={REPORT_COLUMN_LABELS.totalPayout}
        value={formatVNDCompact(data.totalPayout)}
        subNode={<PayoutRatioKpiBadge ratio={payoutRatio} />}
      />

      {/* Doanh thu thuần (GGR) */}
      <KpiCard
        icon={TrendingUp}
        iconBg="bg-blue-100 dark:bg-blue-900/50"
        iconColor="text-blue-600 dark:text-blue-400"
        label={REPORT_COLUMN_LABELS.ggr}
        value={formatVNDCompact(data.ggr)}
        valueClass={getNetProfitColor(data.ggr)}
      />

      {/* Hoa hồng ĐL */}
      <KpiCard
        icon={Percent}
        iconBg="bg-amber-100 dark:bg-amber-900/50"
        iconColor="text-amber-600 dark:text-amber-400"
        label={REPORT_COLUMN_LABELS.totalCommission}
        value={formatVNDCompact(data.totalCommission)}
      />

      {/* Lợi nhuận ròng */}
      <KpiCard
        icon={data.netProfit < 0 ? TrendingDown : TrendingUp}
        iconBg={
          data.netProfit < 0
            ? "bg-red-100 dark:bg-red-900/50"
            : "bg-violet-100 dark:bg-violet-900/50"
        }
        iconColor={
          data.netProfit < 0
            ? "text-red-600 dark:text-red-400"
            : "text-violet-600 dark:text-violet-400"
        }
        label={REPORT_COLUMN_LABELS.netProfit}
        value={formatVNDCompact(data.netProfit)}
        valueClass={getNetProfitColor(data.netProfit)}
      />
    </div>
  );
}

/** Skeleton placeholder match số lượng và layout của GameDrawKpiStrip. */
export function GameDrawKpiStripSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="h-19 w-full animate-pulse rounded-xl border bg-muted" />
      ))}
    </div>
  );
}
