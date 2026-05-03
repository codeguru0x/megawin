"use client";

import { Activity, AlertTriangle, CheckCircle2, FileStack } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { formatNumber, formatPercent } from "@megawin/shared/utils";

import { cn } from "@/lib/utils";

/**
 * KPI strip cho trang "Nhật ký giao dịch".
 *
 * 4 cards cố định — reliability-focused:
 *
 * 1. **Tổng giao dịch** — tổng số call được log trong range.
 * 2. **Tỷ lệ thành công** — success / total. Color theo threshold
 *    (≥ 99% profit, ≥ 95% warning, < 95% loss).
 * 3. **Giao dịch lỗi** — tổng failed, sub chia 2 nhóm operational:
 *    - `đã xử lý` = WAL đã cleanup (business reject HTTP 200 + HTTP 400/401).
 *      Đóng vấn đề, không cần làm gì thêm.
 *    - `cần reconcile` = WAL còn giữ (timeout/network/5xx/batch outer reject).
 *      Chờ scheduler retry hoặc human intervention.
 * 4. **Cần reconcile** — zoom vào subset actionable của KPI 3. Đây là con số
 *    cần theo dõi hằng ngày để phát hiện tenant xuống cấp.
 *
 * Skeleton-friendly: khi `isLoading = true` và chưa có `data`, hiển thị
 * placeholder dash.
 */

interface TxLogKpiCardProps {
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  sub: string;
  valueClass?: string;
}

function TxLogKpiCard({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
  sub,
  valueClass,
}: TxLogKpiCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", iconBg)}>
        <Icon className={cn("size-5", iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={cn("text-lg font-bold tabular-nums text-foreground", valueClass)}>{value}</p>
        <p className="truncate text-xs text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}

export interface TxLogKpiStripProps {
  data:
    | {
        total: number;
        successCount: number;
        failedCount: number;
        uncertainCount: number;
        successRate: number | null;
      }
    | undefined;
  isLoading: boolean;
}

/**
 * Color cho tỷ lệ thành công — theo ngưỡng ops thông dụng:
 *   ≥ 99%  → profit (xanh)
 *   ≥ 95%  → warning (vàng)
 *   < 95%  → loss (đỏ)
 *   null   → mặc định (chưa có data)
 */
function getSuccessRateColor(rate: number | null): string {
  if (rate === null) return "";
  if (rate >= 0.99) return "text-profit";
  if (rate >= 0.95) return "text-warning";
  return "text-loss";
}

export function TxLogKpiStrip({ data, isLoading }: TxLogKpiStripProps) {
  const placeholder = isLoading && !data;
  const total = data?.total ?? 0;
  const successCount = data?.successCount ?? 0;
  const failedCount = data?.failedCount ?? 0;
  const uncertainCount = data?.uncertainCount ?? 0;
  // Operational split: "đã xử lý" = WAL đã cleanup (business reject HTTP 200 +
  // HTTP 400/401). "Cần reconcile" = WAL còn giữ (timeout/network/5xx/batch
  // outer reject) — chờ scheduler retry hoặc human intervention.
  const resolvedCount = failedCount - uncertainCount;
  const successRate = data?.successRate ?? null;

  const successRateText = placeholder
    ? "—"
    : successRate === null
      ? "—"
      : formatPercent(successRate * 100, 1);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <TxLogKpiCard
        icon={FileStack}
        iconBg="bg-indigo-100 dark:bg-indigo-900/50"
        iconColor="text-indigo-600 dark:text-indigo-400"
        label="Tổng giao dịch"
        value={placeholder ? "—" : formatNumber(total)}
        sub={
          placeholder
            ? "\u00a0"
            : `${formatNumber(successCount)} thành công · ${formatNumber(failedCount)} lỗi`
        }
      />
      <TxLogKpiCard
        icon={CheckCircle2}
        iconBg="bg-emerald-100 dark:bg-emerald-900/50"
        iconColor="text-emerald-600 dark:text-emerald-400"
        label="Tỷ lệ thành công"
        value={successRateText}
        valueClass={getSuccessRateColor(successRate)}
        sub={
          placeholder || total === 0
            ? "\u00a0"
            : `${formatNumber(successCount)}/${formatNumber(total)} giao dịch`
        }
      />
      <TxLogKpiCard
        icon={AlertTriangle}
        iconBg="bg-rose-100 dark:bg-rose-900/50"
        iconColor="text-rose-600 dark:text-rose-400"
        label="Giao dịch lỗi"
        value={placeholder ? "—" : formatNumber(failedCount)}
        valueClass={failedCount > 0 ? "text-loss" : ""}
        sub={
          placeholder
            ? "\u00a0"
            : failedCount === 0
              ? "Không có lỗi nào"
              : `${formatNumber(resolvedCount)} đã xử lý · ${formatNumber(uncertainCount)} cần reconcile`
        }
      />
      <TxLogKpiCard
        icon={Activity}
        iconBg="bg-amber-100 dark:bg-amber-900/50"
        iconColor="text-amber-600 dark:text-amber-400"
        label="Cần reconcile"
        value={placeholder ? "—" : formatNumber(uncertainCount)}
        valueClass={uncertainCount > 0 ? "text-warning" : ""}
        sub={
          placeholder
            ? "\u00a0"
            : uncertainCount === 0
              ? "Không có lỗi hạ tầng"
              : "Timeout · Network · HTTP 5xx"
        }
      />
    </div>
  );
}
