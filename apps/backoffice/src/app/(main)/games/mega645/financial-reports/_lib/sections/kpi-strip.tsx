"use client";

import { CalendarRange, Rows3, DollarSign, TrendingUp, Percent } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatVND,
  formatVNDCompact,
  formatPercent,
  formatNumber,
} from "@megawin/shared/utils/number";
import { Skeleton } from "@/components/ui/skeleton";
import { useMega645DrawSummary } from "../use-report-queries";

/** KPI strip tổng hợp — tab "Theo kỳ quay" level list. */
export function KpiStrip({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useMega645DrawSummary(from, to);

  if (isLoading)
    return (
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-[76px] w-full rounded-xl" />
        ))}
      </div>
    );

  if (!data) return null;

  const payoutPct = data.totalStake > 0 ? data.totalPayout / data.totalStake : 0;
  const cards = [
    {
      icon: CalendarRange,
      iconBg: "bg-indigo-100 dark:bg-indigo-900/50",
      iconColor: "text-indigo-600 dark:text-indigo-400",
      label: "Kỳ quay",
      value: formatNumber(data.drawCount),
      sub: `${formatNumber(data.entryCount)} entries · ${formatNumber(data.lineCount)} lines`,
    },
    {
      icon: DollarSign,
      iconBg: "bg-emerald-100 dark:bg-emerald-900/50",
      iconColor: "text-emerald-600 dark:text-emerald-400",
      label: "Doanh thu",
      value: formatVNDCompact(data.totalStake),
      sub: formatVND(data.totalStake),
    },
    {
      icon: Rows3,
      iconBg: "bg-blue-100 dark:bg-blue-900/50",
      iconColor: "text-blue-600 dark:text-blue-400",
      label: "Trả thưởng",
      value: formatVNDCompact(data.totalPayout),
      sub: formatVND(data.totalPayout),
    },
    {
      icon: TrendingUp,
      iconBg: "bg-violet-100 dark:bg-violet-900/50",
      iconColor: "text-violet-600 dark:text-violet-400",
      label: "GGR",
      value: formatVNDCompact(data.ggr),
      sub: `Margin: ${formatPercent(data.totalStake > 0 ? data.ggr / data.totalStake : 0)}`,
      valueClass: data.ggr >= 0 ? "text-profit" : "text-loss",
    },
    {
      icon: Percent,
      iconBg:
        payoutPct > 0.95 ? "bg-red-100 dark:bg-red-900/50" : "bg-amber-100 dark:bg-amber-900/50",
      iconColor:
        payoutPct > 0.95 ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400",
      label: "Payout %",
      value: formatPercent(payoutPct),
      sub: `${formatNumber(data.playerCount)} người chơi · ${formatNumber(data.tenantCount)} đại lý`,
      valueClass: payoutPct > 0.95 ? "text-loss" : payoutPct > 0.8 ? "text-warning" : "",
    },
  ];

  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => (
        <div
          key={c.label}
          className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm"
        >
          <div
            className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", c.iconBg)}
          >
            <c.icon className={cn("size-5", c.iconColor)} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-muted-foreground">{c.label}</p>
            <p className={cn("text-lg font-bold tabular-nums text-foreground", c.valueClass)}>
              {c.value}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">{c.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
