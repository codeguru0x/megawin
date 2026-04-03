"use client";

import { Ban, Ticket, Banknote, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber, formatVNDCompact } from "@megawin/shared/utils";
import type { VoidKpiData } from "./types";

interface KpiCardProps {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  sub: string;
  valueClassName?: string;
}

function KpiCard({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
  sub,
  valueClassName,
}: KpiCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", iconBg)}>
        <Icon className={cn("size-5", iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={cn("text-lg font-bold tabular-nums text-foreground", valueClassName)}>
          {value}
        </p>
        <p className="truncate text-xs text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}

interface VoidKpiStripProps {
  data: VoidKpiData;
}

/**
 * KPI strip cho Void Reports page.
 *
 * 4 KPI cố định: Kỳ huỷ · Lượt cược · Cược gốc · Hoàn trả.
 */
export function VoidKpiStrip({ data }: VoidKpiStripProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        icon={Ban}
        iconBg="bg-rose-100 dark:bg-rose-900/50"
        iconColor="text-rose-600 dark:text-rose-400"
        label="Tổng kỳ huỷ"
        value={formatNumber(data.totalVoidedDraws)}
        sub="Kỳ quay đã void"
      />
      <KpiCard
        icon={Ticket}
        iconBg="bg-blue-100 dark:bg-blue-900/50"
        iconColor="text-blue-600 dark:text-blue-400"
        label="Phiếu cược"
        value={formatNumber(data.totalEntries)}
        sub="Phiếu cược bị huỷ"
      />
      <KpiCard
        icon={Banknote}
        iconBg="bg-emerald-100 dark:bg-emerald-900/50"
        iconColor="text-emerald-600 dark:text-emerald-400"
        label="Tiền cược"
        value={formatVNDCompact(data.totalOriginalStake)}
        sub=""
      />
      <KpiCard
        icon={Undo2}
        iconBg="bg-amber-100 dark:bg-amber-900/50"
        iconColor="text-amber-600 dark:text-amber-400"
        label="Hoàn trả"
        value={formatVNDCompact(data.totalRefundAmount)}
        sub="Đã hoàn cho khách"
        valueClassName="text-amber-600 dark:text-amber-400"
      />
    </div>
  );
}
