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
    <div className="bg-card flex min-w-0 flex-1 items-center gap-3 rounded-xl border p-4 shadow-sm">
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", iconBg)}>
        <Icon className={cn("size-5", iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground truncate text-xs font-medium">{label}</p>
        {loading ? (
          <Skeleton className="mt-0.5 h-7 w-24" />
        ) : (
          <p className="text-foreground text-lg leading-tight font-bold tabular-nums">{value}</p>
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
  const { data: exposureSlice } = useOpsSnapshot<ExposureSlice | null>(effectiveDrawId, isSettled, (s) =>
    s.exposure && s.stats
      ? {
          exposure: s.exposure,
          revenue: s.stats.totals.revenue,
          warnAmount: s.thresholds.exposureWarnAmount,
        }
      : null,
  );

  if (!draw) {
    return null;
  }

  const loading = isLoading || !kpi;

  return (
    <section className="space-y-3">
      <h2 className="text-muted-foreground text-sm font-semibold tracking-wider uppercase">Tổng quan</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          icon={CircleDollarSign}
          iconBg="bg-profit"
          iconColor="text-profit"
          label={REPORT_COLUMN_LABELS.totalStake}
          value={kpi ? formatNumber(kpi.totalRevenue) : "—"}
          loading={loading}
        />
        <KpiCard
          icon={FileText}
          iconBg="bg-info"
          iconColor="text-info"
          label={REPORT_COLUMN_LABELS.entryCount}
          value={kpi ? formatNumber(kpi.totalEntries) : "—"}
          loading={loading}
        />
        <KpiCard
          icon={Hash}
          iconBg="bg-info"
          iconColor="text-info"
          label="Bet Units"
          value={kpi ? formatNumber(kpi.totalBetUnits) : "—"}
          loading={loading}
        />
        <KpiCard
          icon={Users}
          iconBg="bg-game-max3d"
          iconColor="text-game-max3d"
          label={REPORT_COLUMN_LABELS.playerCount}
          value={kpi && kpi.uniquePlayers !== null ? formatNumber(kpi.uniquePlayers) : "—"}
          loading={loading}
        />
        <KpiCard
          icon={Wallet}
          iconBg="bg-warning"
          iconColor="text-warning"
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
