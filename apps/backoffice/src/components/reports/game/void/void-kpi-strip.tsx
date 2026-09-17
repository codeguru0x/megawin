"use client";

import { formatNumber, formatVNDCompact } from "@megawin/shared/utils";
import { Ban, Banknote, Ticket, Undo2 } from "lucide-react";

import { cn } from "@/lib/utils";

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

function KpiCard({ icon: Icon, iconBg, iconColor, label, value, sub, valueClassName }: KpiCardProps) {
  return (
    <div className="bg-card flex items-center gap-3 rounded-xl border p-4 shadow-sm">
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", iconBg)}>
        <Icon className={cn("size-5", iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
        <p className={cn("text-foreground text-lg font-bold tabular-nums", valueClassName)}>{value}</p>
        <p className="text-muted-foreground truncate text-xs">{sub}</p>
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
        iconBg="bg-loss"
        iconColor="text-loss"
        label="Tổng kỳ huỷ"
        value={formatNumber(data.totalVoidedDraws)}
        sub="Kỳ quay đã void"
      />
      <KpiCard
        icon={Ticket}
        iconBg="bg-info"
        iconColor="text-info"
        label="Phiếu cược"
        value={formatNumber(data.totalEntries)}
        sub="Phiếu cược bị huỷ"
      />
      <KpiCard
        icon={Banknote}
        iconBg="bg-profit"
        iconColor="text-profit"
        label="Tiền cược"
        value={formatVNDCompact(data.totalOriginalStake)}
        sub=""
      />
      <KpiCard
        icon={Undo2}
        iconBg="bg-warning"
        iconColor="text-warning"
        label="Hoàn trả"
        value={formatVNDCompact(data.totalRefundAmount)}
        sub="Đã hoàn cho khách"
        valueClassName="text-warning"
      />
    </div>
  );
}
