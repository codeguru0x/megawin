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
import { formatVNDCompact, formatNumber, formatPercent } from "@megawin/shared/utils";
import { calcTrendPercent, type DashboardDayKpis } from "../_lib/compute";
import { HeroKpisSkeleton } from "./skeletons";

interface HeroKpisProps {
  /** KPIs hôm nay (partial, đang cập nhật liên tục). */
  todayKpis: DashboardDayKpis;
  /** KPIs hôm qua (data đã đóng, hoàn chỉnh). Optional vì có thể chưa fetch xong. */
  yesterdayKpis?: DashboardDayKpis;
  /** KPIs cùng thứ tuần trước (dùng tính trend % cho hôm qua). */
  compareKpis?: DashboardDayKpis;
  isLoading: boolean;
}

// ─── Trend badge ──────────────────────────────────────────────────────────────

function TrendBadge({ value }: { value: number }) {
  const isPositive = value >= 0;
  const Icon = isPositive ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[10px] font-semibold",
        isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
      )}
    >
      <Icon className="size-2.5" />
      {isPositive ? "+" : ""}
      {formatPercent(value)}
    </span>
  );
}

// ─── KPI Card (Phương án C: hôm nay + hôm qua + trend) ──────────────────────

interface KpiCardProps {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  label: string;
  /** Giá trị hôm nay — hiển thị nổi bật, đang cập nhật. */
  todayValue: string;
  todayValueClassName?: string;
  /** Giá trị hôm qua (đã đóng). */
  yesterdayValue?: string;
  /** Trend % của hôm qua so với cùng thứ tuần trước. */
  trend?: number | null;
}

/**
 * KPI Card — Phương án C: 2 tầng thông tin.
 *
 * - Tầng chính: giá trị hôm nay (partial, live) + badge "Đang cập nhật"
 * - Tầng phụ: giá trị hôm qua (đã đóng) + trend % vs cùng thứ tuần trước
 *
 * Operator đọc được: "hôm nay đang ở đâu" + "hôm qua kết thúc ra sao + xu hướng gần đây".
 */
function KpiCard({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  todayValue,
  todayValueClassName,
  yesterdayValue,
  trend,
}: KpiCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", iconBg)}>
        <Icon className={cn("size-5", iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <p className={cn("text-lg font-bold tabular-nums text-foreground", todayValueClassName)}>
          {todayValue}
        </p>
        {/* Dòng hôm qua + trend — chỉ hiện khi có data hôm qua */}
        <div className="mt-0.5 flex h-4 items-center gap-1.5">
          {yesterdayValue != null ? (
            <>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                Qua: {yesterdayValue}
              </span>
              {trend != null ? (
                <TrendBadge value={trend} />
              ) : (
                <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/60">
                  <Minus className="size-2.5" />
                </span>
              )}
            </>
          ) : (
            <span className="text-[11px] text-muted-foreground/50">—</span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Zone 1 — Hero KPI strip (5 cards ngang).
 *
 * Phương án C: mỗi card hiện 2 tầng:
 * - Hôm nay (partial, live refresh mỗi 2 phút)
 * - Hôm qua (đã đóng) + trend % vs cùng thứ tuần trước
 *
 * Trend % chỉ tính trên data hôm qua (hoàn chỉnh) → chính xác, không gây nhầm lẫn.
 */
export function HeroKpis({ todayKpis, yesterdayKpis, compareKpis, isLoading }: HeroKpisProps) {
  if (isLoading) return <HeroKpisSkeleton />;

  // Trend hôm qua vs cùng thứ tuần trước — chỉ tính khi có cả 2 bộ data
  const stakeTrend = calcTrendPercent(yesterdayKpis?.totalStake ?? 0, compareKpis?.totalStake);
  const ggrTrend = calcTrendPercent(yesterdayKpis?.totalGgr ?? 0, compareKpis?.totalGgr);
  const profitTrend = calcTrendPercent(yesterdayKpis?.totalProfit ?? 0, compareKpis?.totalProfit);
  const entriesTrend = calcTrendPercent(
    yesterdayKpis?.totalEntries ?? 0,
    compareKpis?.totalEntries,
  );
  const playersTrend = calcTrendPercent(
    yesterdayKpis?.totalPlayers ?? 0,
    compareKpis?.totalPlayers,
  );

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <KpiCard
        icon={CircleDollarSign}
        iconBg="bg-blue-100 dark:bg-blue-900/50"
        iconColor="text-blue-600 dark:text-blue-400"
        label="Doanh thu"
        todayValue={formatVNDCompact(todayKpis.totalStake)}
        yesterdayValue={yesterdayKpis ? formatVNDCompact(yesterdayKpis.totalStake) : undefined}
        trend={yesterdayKpis ? stakeTrend : undefined}
      />
      <KpiCard
        icon={BarChart3}
        iconBg="bg-violet-100 dark:bg-violet-900/50"
        iconColor="text-violet-600 dark:text-violet-400"
        label="GGR"
        todayValue={formatVNDCompact(todayKpis.totalGgr)}
        todayValueClassName={todayKpis.totalGgr < 0 ? "text-red-600 dark:text-red-400" : undefined}
        yesterdayValue={yesterdayKpis ? formatVNDCompact(yesterdayKpis.totalGgr) : undefined}
        trend={yesterdayKpis ? ggrTrend : undefined}
      />
      <KpiCard
        icon={Wallet}
        iconBg="bg-emerald-100 dark:bg-emerald-900/50"
        iconColor="text-emerald-600 dark:text-emerald-400"
        label="Lợi nhuận"
        todayValue={formatVNDCompact(todayKpis.totalProfit)}
        todayValueClassName={
          todayKpis.totalProfit < 0 ? "text-red-600 dark:text-red-400" : undefined
        }
        yesterdayValue={yesterdayKpis ? formatVNDCompact(yesterdayKpis.totalProfit) : undefined}
        trend={yesterdayKpis ? profitTrend : undefined}
      />
      <KpiCard
        icon={Ticket}
        iconBg="bg-amber-100 dark:bg-amber-900/50"
        iconColor="text-amber-600 dark:text-amber-400"
        label="Số vé"
        todayValue={formatNumber(todayKpis.totalEntries)}
        yesterdayValue={yesterdayKpis ? formatNumber(yesterdayKpis.totalEntries) : undefined}
        trend={yesterdayKpis ? entriesTrend : undefined}
      />
      <KpiCard
        icon={Users}
        iconBg="bg-rose-100 dark:bg-rose-900/50"
        iconColor="text-rose-600 dark:text-rose-400"
        label="Người chơi"
        todayValue={formatNumber(todayKpis.totalPlayers)}
        yesterdayValue={yesterdayKpis ? formatNumber(yesterdayKpis.totalPlayers) : undefined}
        trend={yesterdayKpis ? playersTrend : undefined}
      />
    </div>
  );
}
