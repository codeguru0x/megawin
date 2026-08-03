"use client";

/**
 * Max 3D – KPI Section (tab Giám sát)
 *
 * Đọc snapshot (timer 1) qua `select` slice `toKpi` → KPI strip; slice exposure +
 * thresholds riêng → ExposureCard (query dedupe 1 request; `select` chặn cross re-render).
 */

import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import type { Max3dExposureResult } from "@megawin/game-max3d/rules";
import { formatNumber } from "@megawin/shared/utils";
import { CircleDollarSign, FileText, Hash, Users, Wallet } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { toKpi } from "../../adapters";
import type { OpsKpi } from "../../types";
import { useDrawContext } from "../../use-draw-context";
import { useOpsSnapshot } from "../../use-operations";
import { ExposureCard } from "./exposure-card";

interface KpiCardProps {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  loading?: boolean;
}

function KpiCard({ icon: Icon, iconBg, iconColor, label, value, loading }: KpiCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm flex-1 min-w-0">
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", iconBg)}>
        <Icon className={cn("size-5", iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground truncate">{label}</p>
        {loading ? (
          <Skeleton className="h-7 w-24 mt-0.5" />
        ) : (
          <p className="text-lg font-bold tabular-nums text-foreground leading-tight">{value}</p>
        )}
      </div>
    </div>
  );
}

/** Slice exposure + ngưỡng cho ExposureCard — gom 1 object để select 1 lần. */
interface ExposureSlice {
  exposure: Max3dExposureResult;
  revenue: number;
  warnAmount: number;
}

export function KpiSection() {
  const { draw, effectiveDrawId, isSettled } = useDrawContext();

  // Slice `totals` → KPI strip.
  const { data: kpi, isLoading } = useOpsSnapshot<OpsKpi | null>(effectiveDrawId, isSettled, (s) =>
    s.stats ? toKpi(s.stats) : null,
  );

  // Slice `exposure` + thresholds — ngưỡng TUYỆT ĐỐI VND từ config.
  const { data: exposureSlice } = useOpsSnapshot<ExposureSlice | null>(
    effectiveDrawId,
    isSettled,
    (s) =>
      s.exposure && s.stats
        ? {
            exposure: s.exposure,
            revenue: s.stats.totals.revenue,
            warnAmount: s.thresholds.exposureWarnAmount,
          }
        : null,
  );

  if (!draw) return null;

  const loading = isLoading || !kpi;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Tổng quan
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          icon={CircleDollarSign}
          iconBg="bg-emerald-100 dark:bg-emerald-900/50"
          iconColor="text-emerald-600 dark:text-emerald-400"
          label={REPORT_COLUMN_LABELS.totalStake}
          value={kpi ? formatNumber(kpi.totalRevenue) : "—"}
          loading={loading}
        />
        <KpiCard
          icon={FileText}
          iconBg="bg-blue-100 dark:bg-blue-900/50"
          iconColor="text-blue-600 dark:text-blue-400"
          label={REPORT_COLUMN_LABELS.entryCount}
          value={kpi ? formatNumber(kpi.totalEntries) : "—"}
          loading={loading}
        />
        <KpiCard
          icon={Hash}
          iconBg="bg-indigo-100 dark:bg-indigo-900/50"
          iconColor="text-indigo-600 dark:text-indigo-400"
          label="Bet Units"
          value={kpi ? formatNumber(kpi.totalBetUnits) : "—"}
          loading={loading}
        />
        <KpiCard
          icon={Users}
          iconBg="bg-violet-100 dark:bg-violet-900/50"
          iconColor="text-violet-600 dark:text-violet-400"
          label={REPORT_COLUMN_LABELS.playerCount}
          value={kpi && kpi.uniquePlayers !== null ? formatNumber(kpi.uniquePlayers) : "—"}
          loading={loading}
        />
        <KpiCard
          icon={Wallet}
          iconBg="bg-amber-100 dark:bg-amber-900/50"
          iconColor="text-amber-600 dark:text-amber-400"
          label={REPORT_COLUMN_LABELS.totalCommission}
          value={kpi ? formatNumber(kpi.totalCommission) : "—"}
          loading={loading}
        />
      </div>
      {exposureSlice && (
        <ExposureCard
          exposure={exposureSlice.exposure}
          revenue={exposureSlice.revenue}
          warnAmount={exposureSlice.warnAmount}
        />
      )}
    </section>
  );
}
