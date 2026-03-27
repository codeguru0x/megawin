"use client";

import { useMemo } from "react";
import { CircleDollarSign, FileText, Hash, Users, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@megawin/shared/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useDrawContext } from "../../use-draw-context";
import { useOpsSummary } from "../../use-operations";

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

export function KpiSection() {
  const { draw, opsParams, isSettled } = useDrawContext();
  const { data, isLoading } = useOpsSummary(opsParams, isSettled);

  const kpi = useMemo(() => {
    if (!data) return null;
    return {
      totalRevenue: data.totalRevenue,
      totalEntries: data.totalEntries,
      totalBetUnits: data.totalBetUnits,
      uniquePlayers: data.totalPlayers,
      totalCommission: data.totalCommission,
      netRevenue: data.totalRevenue - data.totalCommission,
    };
  }, [data]);

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
          label="Doanh thu"
          value={kpi ? formatNumber(kpi.totalRevenue) : "—"}
          loading={loading}
        />
        <KpiCard
          icon={FileText}
          iconBg="bg-blue-100 dark:bg-blue-900/50"
          iconColor="text-blue-600 dark:text-blue-400"
          label="Entries"
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
          label="Người chơi"
          value={kpi ? formatNumber(kpi.uniquePlayers) : "—"}
          loading={loading}
        />
        <KpiCard
          icon={Wallet}
          iconBg="bg-amber-100 dark:bg-amber-900/50"
          iconColor="text-amber-600 dark:text-amber-400"
          label="Hoa hồng ĐL"
          value={kpi ? formatNumber(kpi.totalCommission) : "—"}
          loading={loading}
        />
      </div>
    </section>
  );
}
