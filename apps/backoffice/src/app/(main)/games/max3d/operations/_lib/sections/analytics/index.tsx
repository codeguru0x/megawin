"use client";

/**
 * Max 3D Operations — Analytics Section
 *
 * Block tổng hợp toàn bộ phân tích cược:
 * - PlayTypeCard: phân bổ kiểu chơi (basic + plus modes)
 * - TripletHeatmap: top N bộ ba số phổ biến (thay thế NumberHeatmap của Lotto535)
 * - LiveFeed: cược gần nhất real-time
 *
 * Max 3D specific: 2 play modes (basic + plus), triplet-based (000-999).
 */

import { useMemo } from "react";
import { DrawStatus } from "@megawin/game-core/entities";
import { PlayMode, PlayType } from "@megawin/game-max3d/entities";
import { MAX3D_MODE_TYPE_LABELS } from "@megawin/game-max3d/labels";

import { useDrawContext } from "../../use-draw-context";
import {
  useOpsPlayTypeDistribution,
  useOpsTenantBreakdown,
  useOpsTripletFrequency,
  useOpsTopCombos,
  useOpsLiveEntries,
} from "../../use-operations";
import { PlayTypeCard, TenantBreakdown } from "./analytics-panels";
import { TripletHeatmap } from "./triplet-heatmap";
import { LiveFeed } from "./live-feed";

import type { PlayTypeRow, TenantRow, TripletFreq, LiveFeedEntry } from "../../types";

const ANALYTICS_SHOW = new Set<string>([
  DrawStatus.SalesOpen,
  DrawStatus.SalesClosed,
  DrawStatus.Published,
  DrawStatus.Settling,
  DrawStatus.Settled,
]);

// ─── Component ────────────────────────────────────────────────────────────────

export function AnalyticsSection() {
  const { draw, effectiveDrawId, isSettled, opsParams } = useDrawContext();

  const { data: playtypeData } = useOpsPlayTypeDistribution(opsParams, isSettled);
  const { data: tenantData } = useOpsTenantBreakdown(opsParams, isSettled);
  const { data: freqData } = useOpsTripletFrequency(opsParams, isSettled);
  const { data: topCombosData } = useOpsTopCombos(effectiveDrawId, isSettled);
  const { data: liveData } = useOpsLiveEntries(effectiveDrawId, isSettled);

  // ── Adapters: API data → UI types ─────────────────────────────────────────

  const playTypes: PlayTypeRow[] = useMemo(() => {
    if (!playtypeData) return [];
    const totalLines = playtypeData.distribution.reduce((a, d) => a + d.lineCount, 0);
    return playtypeData.distribution.map((d) => {
      const key = `${d.playMode}.${d.playType}`;
      return {
        playMode: d.playMode as PlayMode,
        playType: d.playType as PlayType,
        label: MAX3D_MODE_TYPE_LABELS[key] ?? key,
        entries: d.entryCount,
        lines: d.lineCount,
        revenue: d.revenue,
        pct: totalLines > 0 ? (d.lineCount / totalLines) * 100 : 0,
      };
    });
  }, [playtypeData]);

  const tenants: TenantRow[] = useMemo(() => {
    if (!tenantData) return [];
    const totalRevenue = tenantData.tenants.reduce((a, t) => a + t.revenue, 0);
    return tenantData.tenants.map((t) => ({
      tenantId: t.tenantId,
      tenantName: t.tenantId,
      entries: t.entries,
      betUnits: t.betUnits,
      revenue: t.revenue,
      commission: t.commission,
      pct: totalRevenue > 0 ? (t.revenue / totalRevenue) * 100 : 0,
    }));
  }, [tenantData]);

  const triplets: TripletFreq[] = useMemo(() => {
    if (!freqData) return [];
    return freqData.triplets.map((f) => ({
      triplet: f.triplet,
      count: f.count,
      revenue: f.revenue,
    }));
  }, [freqData]);

  const liveFeed: LiveFeedEntry[] = useMemo(() => {
    if (!liveData) return [];
    return liveData.entries.map((e) => {
      const firstBoard = e.boards[0];
      const playMode = (firstBoard?.playMode ?? PlayMode.Basic) as PlayMode;
      const playType = (firstBoard?.playType ?? PlayType.Straight) as PlayType;
      const key = `${playMode}.${playType}`;
      return {
        entryId: e.entryId.slice(-6).toUpperCase(),
        time: e.createdAt,
        playMode,
        playType,
        playTypeLabel: MAX3D_MODE_TYPE_LABELS[key] ?? key,
        triplets: firstBoard?.triplets ?? [],
        lineCount: firstBoard?.lineCount ?? 1,
        betCount: firstBoard?.betCount ?? 1,
        amount: e.amount,
        username: e.username ?? "",
        tenant: e.tenantId,
      };
    });
  }, [liveData]);

  if (!draw || !ANALYTICS_SHOW.has(draw.status)) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Phân tích cược
      </h2>

      <PlayTypeCard distribution={playTypes} />

      <div className="grid gap-4 lg:grid-cols-[7fr_3fr] items-stretch">
        <TripletHeatmap
          triplets={triplets}
          singleCombos={topCombosData?.singleCombos}
          plusCombos={topCombosData?.plusCombos}
          tenants={tenants}
        />
        <LiveFeed entries={liveFeed} isSettled={isSettled} />
      </div>
    </section>
  );
}
