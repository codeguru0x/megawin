"use client";

/**
 * Keno – KPI Section
 *
 * Lazy-load KPI strip từ opsSummary.
 * Keno: boards chứa cả cơ bản + bổ sung (unified).
 * Refetch mỗi 15s khi kỳ đang active (chu kỳ ngắn ~8 phút).
 */

import { Skeleton } from "@/components/ui/skeleton";
import { useDrawContext } from "../../use-draw-context";
import { useOpsSummary } from "../../use-operations";
import { KpiStrip } from "./kpi-strip";
import type { OpsKpi } from "../../types";

export function KpiSection() {
  const { opsParams, isSettled, effectiveDrawId } = useDrawContext();
  const { data, isLoading } = useOpsSummary(opsParams, isSettled);

  if (!effectiveDrawId) return null;

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-18 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const kpi: OpsKpi = {
    totalRevenue: data.totalRevenue,
    totalEntries: data.totalEntries,
    totalBoards: data.totalBoards,
    uniquePlayers: data.uniquePlayers,
    totalCommission: data.totalCommission,
    netRevenue: data.totalRevenue - data.totalCommission,
  };

  return (
    <div className="space-y-3">
      <KpiStrip kpi={kpi} />
    </div>
  );
}
