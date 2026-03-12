"use client";

import { CircleDollarSign, FileText, Hash, Users, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@megawin/shared/utils/number";
import type { OpsKpi } from "../../types";

interface KpiCardProps {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  sub?: string;
}

function KpiCard({ icon: Icon, iconBg, iconColor, label, value, sub }: KpiCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm flex-1 min-w-0">
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", iconBg)}>
        <Icon className={cn("size-5", iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-muted-foreground truncate">{label}</p>
        <p className="text-lg font-bold tabular-nums text-foreground leading-tight">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground truncate">{sub}</p>}
      </div>
    </div>
  );
}

export function KpiStrip({ kpi }: { kpi: OpsKpi }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <KpiCard
        icon={CircleDollarSign}
        iconBg="bg-emerald-100 dark:bg-emerald-900/50"
        iconColor="text-emerald-600 dark:text-emerald-400"
        label="Doanh thu"
        value={formatNumber(kpi.totalRevenue)}
      />
      <KpiCard
        icon={FileText}
        iconBg="bg-blue-100 dark:bg-blue-900/50"
        iconColor="text-blue-600 dark:text-blue-400"
        label="Entries"
        value={formatNumber(kpi.totalEntries)}
      />
      <KpiCard
        icon={Hash}
        iconBg="bg-indigo-100 dark:bg-indigo-900/50"
        iconColor="text-indigo-600 dark:text-indigo-400"
        label="Lines"
        value={formatNumber(kpi.totalLines)}
      />
      <KpiCard
        icon={Users}
        iconBg="bg-violet-100 dark:bg-violet-900/50"
        iconColor="text-violet-600 dark:text-violet-400"
        label="Người chơi"
        value={formatNumber(kpi.uniquePlayers)}
      />
      <KpiCard
        icon={Wallet}
        iconBg="bg-amber-100 dark:bg-amber-900/50"
        iconColor="text-amber-600 dark:text-amber-400"
        label="Hoa hồng ĐL"
        value={formatNumber(kpi.totalCommission)}
      />
      <KpiCard
        icon={CircleDollarSign}
        iconBg="bg-purple-100 dark:bg-purple-900/50"
        iconColor="text-purple-600 dark:text-purple-400"
        label="Doanh thu thuần"
        value={formatNumber(kpi.netRevenue)}
        sub="Sau hoa hồng đại lý"
      />
    </div>
  );
}
