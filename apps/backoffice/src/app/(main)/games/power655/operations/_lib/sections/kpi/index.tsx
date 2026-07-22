"use client";

/**
 * Power 6/55 – KPI Section
 *
 * Lazy-load KPI strip từ opsSummary.
 * Dừng refetch khi kỳ đã settle.
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
    totalLines: data.totalLines,
    uniquePlayers: data.uniquePlayers,
    totalCommission: data.totalCommission,
    netRevenue: data.totalRevenue - data.totalCommission,
  };

  return <KpiStrip kpi={kpi} />;
}
