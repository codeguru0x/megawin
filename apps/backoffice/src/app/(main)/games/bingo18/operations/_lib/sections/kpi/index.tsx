"use client";

import { useMemo } from "react";

import { BINGO18_SIDE_BET_PLAY_TYPE_SET } from "@megawin/game-bingo18/entities";
import { DrawStatus } from "@megawin/game-core/entities";

import type { OpsKpi } from "../../types";
import { useDrawContext } from "../../use-draw-context";
import type { PlayTypeDistributionItem } from "../../use-operations";
import { useOpsPlayTypeDistribution, useOpsSummary } from "../../use-operations";
import { KpiStrip } from "./kpi-strip";

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
  const { data: playtypeData } = useOpsPlayTypeDistribution(opsParams, isSettled);

  // Tính totalSideBets từ playtype distribution (chính xác, bao gồm toàn bộ entries).
  // Backend trả totalBoards (gộp cả basic + side bet) — UI tách ra bằng filter playType.
  const totalSideBets = useMemo(() => {
    if (!playtypeData) return 0;
    return playtypeData.distribution
      .filter((d: PlayTypeDistributionItem) => BINGO18_SIDE_BET_PLAY_TYPE_SET.has(d.playType))
      .reduce((sum: number, d: PlayTypeDistributionItem) => sum + d.selectionCount, 0);
  }, [playtypeData]);

  if (!draw || !KPI_SHOW.has(draw.status as any) || !data) return null;

  const kpi: OpsKpi = {
    totalRevenue: data.totalRevenue,
    totalEntries: data.totalEntries,
    totalBasicBoards: data.totalBoards - totalSideBets,
    totalSideBets,
    uniquePlayers: data.totalPlayers,
    totalCommission: data.totalCommission,
  };

  return (
    <section>
      <KpiStrip kpi={kpi} />
    </section>
  );
}
