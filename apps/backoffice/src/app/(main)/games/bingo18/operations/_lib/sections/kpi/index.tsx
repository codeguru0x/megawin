"use client";

import { DrawStatus } from "@megawin/game-core/entities";
import { useDrawContext } from "../../use-draw-context";
import { useOpsSummary } from "../../use-operations";
import { KpiStrip } from "./kpi-strip";
import type { OpsKpi } from "../../types";

const KPI_SHOW = new Set([
  DrawStatus.SalesOpen,
  DrawStatus.SalesClosed,
  DrawStatus.Published,
  DrawStatus.Settling,
  DrawStatus.Settled,
]);

export function KpiSection() {
  const { draw, opsParams, isSettled } = useDrawContext();
  const { data } = useOpsSummary(opsParams, isSettled);

  if (!draw || !KPI_SHOW.has(draw.status as any) || !data) return null;

  const kpi: OpsKpi = {
    totalRevenue: data.totalRevenue,
    totalEntries: data.totalEntries,
    totalBoards: data.totalBoards,
    totalSideBets: data.totalSideBets,
    uniquePlayers: data.totalPlayers,
    totalCommission: data.totalCommission,
  };

  return (
    <section>
      <KpiStrip kpi={kpi} />
    </section>
  );
}
