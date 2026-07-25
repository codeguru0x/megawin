"use client";

import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { formatNumber, formatVNDCompact } from "@megawin/shared/utils";
import { Banknote, CalendarClock, HandCoins, Rows3, Ticket } from "lucide-react";

import { cn } from "@/lib/utils";

import type { OutstandingKpiData } from "./types";

interface KpiCardProps {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  sub: string;
}

function KpiCard({ icon: Icon, iconBg, iconColor, label, value, sub }: KpiCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", iconBg)}>
        <Icon className={cn("size-5", iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <p className="text-lg font-bold tabular-nums text-foreground">{value}</p>
        <p className="truncate text-[11px] text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}

interface OutstandingKpiStripProps {
  data: OutstandingKpiData;
  /**
   * Game có cột "Bộ số / Dòng cược" không.
   * Lotto535, Mega645, Power655, Max3D, Max3DPro = true.
   * Keno, Bingo18 = false (ẩn KPI lineCount).
   */
  showLineCount?: boolean;
  /** Label cho cột dòng cược. Default: "Dòng cược". Max3D dùng "Bộ số". */
  lineCountLabel?: string;
}

/**
 * KPI strip cho Outstanding page.
 *
 * Hiển thị 4 hoặc 5 KPI tùy game:
 * - Luôn có: Kỳ đang hoạt động · Lượt cược · Hoa hồng ĐL · Tiền cược
 * - Có `showLineCount`: thêm KPI Bộ số / Dòng cược
 */
export function OutstandingKpiStrip({ data, showLineCount = false, lineCountLabel }: OutstandingKpiStripProps) {
  const lineLabel = lineCountLabel ?? REPORT_COLUMN_LABELS.lineCount;
  const cols = showLineCount ? "lg:grid-cols-5" : "lg:grid-cols-4";

  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3", cols)}>
      <KpiCard
        icon={CalendarClock}
        iconBg="bg-indigo-100 dark:bg-indigo-900/50"
        iconColor="text-indigo-600 dark:text-indigo-400"
        label="Kỳ đang hoạt động"
        value={formatNumber(data.activeDrawCount)}
        sub="Kỳ quay chưa có kết quả"
      />
      <KpiCard
        icon={Ticket}
        iconBg="bg-blue-100 dark:bg-blue-900/50"
        iconColor="text-blue-600 dark:text-blue-400"
        label={REPORT_COLUMN_LABELS.entryCount}
        value={formatNumber(data.totalEntries)}
        sub="Số phiếu cược đang chờ"
      />
      {showLineCount && (
        <KpiCard
          icon={Rows3}
          iconBg="bg-violet-100 dark:bg-violet-900/50"
          iconColor="text-violet-600 dark:text-violet-400"
          label={lineLabel}
          value={formatNumber(data.totalLines ?? 0)}
          sub="Đang chờ kết quả"
        />
      )}
      <KpiCard
        icon={HandCoins}
        iconBg="bg-amber-100 dark:bg-amber-900/50"
        iconColor="text-amber-600 dark:text-amber-400"
        label={REPORT_COLUMN_LABELS.estimatedCommission}
        value={formatVNDCompact(data.totalCommission)}
        sub="Hoa hồng đại lý"
      />
      <KpiCard
        icon={Banknote}
        iconBg="bg-emerald-100 dark:bg-emerald-900/50"
        iconColor="text-emerald-600 dark:text-emerald-400"
        label={REPORT_COLUMN_LABELS.totalStake}
        value={formatVNDCompact(data.totalStake)}
        sub="Tiền cược chưa có kết quả"
      />
    </div>
  );
}
