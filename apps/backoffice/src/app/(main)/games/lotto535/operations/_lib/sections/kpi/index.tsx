"use client";

/**
 * Lotto 5/35 Operations — KPI Section
 *
 * Tự fetch dữ liệu KPI và render KpiStrip.
 * Visibility logic được tích hợp — chỉ render khi draw ở trạng thái phù hợp.
 */

import { DrawStatus } from "@megawin/game-core/entities";

import { useDrawContext } from "../../use-draw-context";
import { useOpsSummary } from "../../use-operations";
import { KpiStrip } from "./kpi-strip";

const KPI_SHOW = new Set([
  DrawStatus.SalesOpen,
  DrawStatus.SalesClosed,
  DrawStatus.Published,
  DrawStatus.Settling,
  DrawStatus.Settled,
  DrawStatus.Void,
]);

export function KpiSection() {
  const { draw, opsParams, isSettled } = useDrawContext();
  const { data: kpiData } = useOpsSummary(opsParams, isSettled);

  if (!draw || !KPI_SHOW.has(draw.status as any) || !kpiData) return null;

  const kpi = {
    totalRevenue: kpiData.totalRevenue,
    totalEntries: kpiData.totalEntries,
    totalLines: kpiData.totalLines,
    uniquePlayers: kpiData.uniquePlayers,
    totalCommission: kpiData.totalCommission,
    netRevenue: kpiData.totalRevenue - kpiData.totalCommission,
    prevRevenue: 0,
    prevEntries: 0,
    prevLines: 0,
  };

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Tổng quan cược</h2>
      <KpiStrip kpi={kpi} />
    </section>
  );
}
