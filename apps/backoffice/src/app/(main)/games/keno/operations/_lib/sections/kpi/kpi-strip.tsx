"use client";

import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { formatNumber } from "@megawin/shared/utils";
import { CircleDollarSign, FileText, Grid2x2, Users, Wallet } from "lucide-react";

import { cn } from "@/lib/utils";

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
    <div className="bg-card flex min-w-0 flex-1 items-center gap-3 rounded-xl border p-4 shadow-sm">
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", iconBg)}>
        <Icon className={cn("size-5", iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground truncate text-xs font-medium">{label}</p>
        <p className="text-foreground text-lg leading-tight font-bold tabular-nums">{value}</p>
        {sub && <p className="text-muted-foreground truncate text-xs">{sub}</p>}
      </div>
    </div>
  );
}

/**
 * KPI strip cho Keno Operations — 6 cards theo pattern chuẩn `operations-page-ui.mdc` §10.
 *
 * Keno: boards bao gồm cả cơ bản (pick1-10) và bổ sung (bigSmall/evenOdd) —
 * card "Boards" thay cho "Lines" của các game expand lines (1 board = 1 line).
 */
export function KpiStrip({ kpi }: { kpi: OpsKpi }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <KpiCard
        icon={CircleDollarSign}
        iconBg="bg-profit"
        iconColor="text-profit"
        label="Doanh thu"
        value={formatNumber(kpi.totalRevenue)}
      />
      <KpiCard
        icon={FileText}
        iconBg="bg-info"
        iconColor="text-info"
        label="Entries"
        value={formatNumber(kpi.totalEntries)}
      />
      <KpiCard
        icon={Grid2x2}
        iconBg="bg-info"
        iconColor="text-info"
        label="Số bộ cược"
        value={formatNumber(kpi.totalSets)}
        sub="cơ bản + bổ sung"
      />
      <KpiCard
        icon={Users}
        iconBg="bg-game-max3d"
        iconColor="text-game-max3d"
        label="Người chơi"
        value={kpi.uniquePlayers === null ? "—" : formatNumber(kpi.uniquePlayers)}
      />
      <KpiCard
        icon={Wallet}
        iconBg="bg-warning"
        iconColor="text-warning"
        label="Hoa hồng ĐL"
        value={formatNumber(kpi.totalCommission)}
      />
      <KpiCard
        icon={CircleDollarSign}
        iconBg="bg-warning"
        iconColor="text-warning"
        label={REPORT_COLUMN_LABELS.netRevenueAfterCommission}
        value={formatNumber(kpi.netRevenue)}
        sub="Sau hoa hồng đại lý"
      />
    </div>
  );
}
