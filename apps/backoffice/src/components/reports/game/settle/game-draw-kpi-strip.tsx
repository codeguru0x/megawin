"use client";

import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { formatNumber, formatVNDCompact } from "@megawin/shared/utils";
import { CalendarRange, DollarSign, Percent, TrendingDown, TrendingUp } from "lucide-react";

import { getNetProfitColor, getPayoutRatioColor, PayoutRatioKpiBadge } from "@/components/reports/payout-ratio";

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
        iconBg="bg-info"
        iconColor="text-info"
        label={`Tổng ${REPORT_COLUMN_LABELS.drawCount.toLowerCase()}`}
        value={formatNumber(data.drawCount)}
        sub={drawCountSub}
      />

      {/* Tiền cược */}
      <KpiCard
        icon={DollarSign}
        iconBg="bg-profit"
        iconColor="text-profit"
        label={REPORT_COLUMN_LABELS.totalStake}
        value={formatVNDCompact(data.totalStake)}
        sub={`${formatNumber(data.entryCount)} lượt cược`}
      />

      {/* Trả thưởng + Tỷ lệ TT — gộp 1 card */}
      <KpiCard
        icon={TrendingDown}
        iconBg={payoutColor ? "bg-loss" : "bg-warning"}
        iconColor={payoutColor ? "text-loss" : "text-warning"}
        label={REPORT_COLUMN_LABELS.totalPayout}
        value={formatVNDCompact(data.totalPayout)}
        subNode={<PayoutRatioKpiBadge ratio={payoutRatio} />}
      />

      {/* Doanh thu thuần (GGR) */}
      <KpiCard
        icon={TrendingUp}
        iconBg="bg-info"
        iconColor="text-info"
        label={REPORT_COLUMN_LABELS.ggr}
        value={formatVNDCompact(data.ggr)}
        valueClass={getNetProfitColor(data.ggr)}
      />

      {/* Hoa hồng ĐL */}
      <KpiCard
        icon={Percent}
        iconBg="bg-warning"
        iconColor="text-warning"
        label={REPORT_COLUMN_LABELS.totalCommission}
        value={formatVNDCompact(data.totalCommission)}
      />

      {/* Lợi nhuận ròng */}
      <KpiCard
        icon={data.netProfit < 0 ? TrendingDown : TrendingUp}
        iconBg={data.netProfit < 0 ? "bg-loss" : "bg-game-max3d"}
        iconColor={data.netProfit < 0 ? "text-loss" : "text-game-max3d"}
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
        <div key={i} className="bg-muted h-19 w-full animate-pulse rounded-xl border" />
      ))}
    </div>
  );
}
