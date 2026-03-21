"use client";

/**
 * Max 3D Pro Operations — Analytics Section
 *
 * Block tổng hợp toàn bộ phân tích cược:
 * - PlayModeCard: phân bổ kiểu chơi (multiNumber + multiDigit)
 * - TripletHeatmap: top N bộ ba số phổ biến + cặp đôi phổ biến nhất
 * - LiveFeed: cược gần nhất real-time
 *
 * Max 3D Pro specific: 2 play modes (multiNumber + multiDigit),
 * triplet-based (000-999), cặp đôi TripletPair là đơn vị cược cơ bản.
 */

import { useMemo } from "react";
import { DrawStatus } from "@megawin/game-core/entities";
import { PlayMode } from "@megawin/game-max3dpro/entities";
import { MAX3DPRO_PLAY_MODE_LABELS } from "@megawin/game-max3dpro/labels";

import { useDrawContext } from "../../use-draw-context";
import {
  useOpsPlayTypeDistribution,
  useOpsTenantBreakdown,
  useOpsTripletFrequency,
  useOpsTopCombos,
  useOpsLiveEntries,
} from "../../use-operations";
import { PlayModeCard, TenantBreakdown } from "./analytics-panels";
import { TripletHeatmap } from "./triplet-heatmap";
import { LiveFeed } from "./live-feed";

import type { PlayTypeRow, TenantRow, TripletFreq, LiveFeedEntry } from "../../types";

// ─── Label maps ───────────────────────────────────────────────────────────────

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
    const totalLines = playtypeData.distribution.reduce(
      (a: number, d: { lineCount: number }) => a + d.lineCount,
      0,
    );
    return playtypeData.distribution.map(
      (d: {
        playMode: string;
        entryCount: number;
        lineCount: number;
        revenue: number;
        avgPairsPerEntry?: number;
      }) => ({
        playMode: d.playMode as PlayMode,
        label: MAX3DPRO_PLAY_MODE_LABELS[d.playMode as PlayMode] ?? d.playMode,
        entries: d.entryCount,
        lines: d.lineCount,
        revenue: d.revenue,
        pct: totalLines > 0 ? (d.lineCount / totalLines) * 100 : 0,
        avgPairsPerEntry: d.avgPairsPerEntry ?? 0,
      }),
    );
  }, [playtypeData]);

  const tenants: TenantRow[] = useMemo(() => {
    if (!tenantData) return [];
    const totalRevenue = tenantData.tenants.reduce(
      (a: number, t: { revenue: number }) => a + t.revenue,
      0,
    );
    return tenantData.tenants.map((t) => ({
      tenantId: t.tenantId,
      tenantName: t.tenantId,
      entries: t.entries,
      lines: t.betUnits,
      revenue: t.revenue,
      commission: t.commission,
      pct: totalRevenue > 0 ? (t.revenue / totalRevenue) * 100 : 0,
    }));
  }, [tenantData]);

  const triplets: TripletFreq[] = useMemo(() => {
    if (!freqData) return [];
    return freqData.triplets.map((f: { triplet: string; count: number; revenue: number }) => ({
      triplet: f.triplet,
      count: f.count,
      revenue: f.revenue,
    }));
  }, [freqData]);

  const liveFeed: LiveFeedEntry[] = useMemo(() => {
    if (!liveData) return [];
    return liveData.entries.map(
      (e: {
        entryId: string;
        createdAt: string;
        boards: Array<{ playMode: string; triplets: string[]; lineCount: number }>;
        amount: number;
        username?: string;
        tenantId: string;
      }) => {
        const firstBoard = e.boards[0];
        const playMode = (firstBoard?.playMode ?? PlayMode.MultiNumber) as PlayMode;
        return {
          entryId: e.entryId.slice(-6).toUpperCase(),
          time: e.createdAt,
          playMode,
          playModeLabel: MAX3DPRO_PLAY_MODE_LABELS[playMode] ?? playMode,
          triplets: firstBoard?.triplets ?? [],
          lineCount: firstBoard?.lineCount ?? 1,
          amount: e.amount,
          username: e.username ?? "",
          tenant: e.tenantId,
        };
      },
    );
  }, [liveData]);

  if (!draw || !ANALYTICS_SHOW.has(draw.status)) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Phân tích cược
      </h2>

      <PlayModeCard distribution={playTypes} />

      <div className="grid gap-4 lg:grid-cols-[7fr_3fr] items-stretch">
        <TripletHeatmap
          triplets={triplets}
          pairCombos={topCombosData?.pairCombos}
          tenants={tenants}
        />
        <LiveFeed entries={liveFeed} isSettled={isSettled} />
      </div>
    </section>
  );
}
