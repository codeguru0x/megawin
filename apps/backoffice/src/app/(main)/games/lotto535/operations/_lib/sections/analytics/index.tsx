"use client";

/**
 * Lotto 5/35 Operations — Analytics Section
 *
 * Block tổng hợp toàn bộ phân tích cược:
 * - PlayTypeCard: phân bổ kiểu chơi
 * - NumberHeatmap: tần suất số + top combos + tenant breakdown
 * - LiveFeed: cược gần nhất real-time
 *
 * Data được fetch trong section này, adapters chuyển đổi API → UI types.
 * Visibility logic được tích hợp — chỉ render khi draw ở trạng thái phù hợp.
 */

import { useMemo } from "react";
import { DrawStatus } from "@megawin/game-core/entities";
import { PlayType } from "@megawin/game-lotto535/entities";
import { LOTTO535_PLAY_TYPE_LABELS } from "@megawin/game-lotto535/labels";

import { useDrawContext } from "../../use-draw-context";
import {
  useOpsPlayTypeDistribution,
  useOpsTenantBreakdown,
  useOpsNumberFrequency,
  useOpsTopCombos,
  useOpsLiveEntries,
} from "../../use-operations";
import { PlayTypeCard } from "./analytics-panels";
import { NumberHeatmap } from "./number-heatmap";
import { LiveFeed } from "./live-feed";

import type { PlayTypeRow, TenantRow, NumberFreq, LiveFeedEntry } from "../../types";

const ANALYTICS_SHOW = new Set([
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
  const { data: freqData } = useOpsNumberFrequency(opsParams, isSettled);
  const { data: topCombosData } = useOpsTopCombos(effectiveDrawId, isSettled);
  const { data: liveData } = useOpsLiveEntries(effectiveDrawId, isSettled);

  // ── Adapters: API data → UI types ─────────────────────────────────────────

  const playTypes: PlayTypeRow[] = useMemo(() => {
    if (!playtypeData) return [];
    const totalLines = playtypeData.distribution.reduce((a, d) => a + d.lineCount, 0);
    return playtypeData.distribution.map((d) => ({
      playType: d.playType as PlayType,
      label: LOTTO535_PLAY_TYPE_LABELS[d.playType] ?? d.playType,
      entries: d.entryCount,
      lines: d.lineCount,
      revenue: d.revenue,
      pct: totalLines > 0 ? (d.lineCount / totalLines) * 100 : 0,
    }));
  }, [playtypeData]);

  const tenants: TenantRow[] = useMemo(() => {
    if (!tenantData) return [];
    const totalRevenue = tenantData.tenants.reduce((a, t) => a + t.revenue, 0);
    return tenantData.tenants.map((t) => ({
      tenantId: t.tenantId,
      tenantName: t.tenantId,
      entries: t.entries,
      lines: t.lines,
      revenue: t.revenue,
      commission: t.commission,
      pct: totalRevenue > 0 ? (t.revenue / totalRevenue) * 100 : 0,
    }));
  }, [tenantData]);

  const numberFreq: { main: NumberFreq[]; special: NumberFreq[] } | undefined = useMemo(() => {
    if (!freqData) return undefined;
    const toFreq = (
      items: { number: number; count: number; lines: number; entries: number; revenue: number }[],
    ): NumberFreq[] =>
      items.map((f) => ({
        number: String(f.number).padStart(2, "0"),
        count: f.count,
        lines: f.lines,
        amount: f.revenue,
      }));
    return {
      main: toFreq(freqData.mainNumbers),
      special: toFreq(freqData.specialNumbers),
    };
  }, [freqData]);

  const liveFeed: LiveFeedEntry[] = useMemo(() => {
    if (!liveData) return [];
    return liveData.entries.map((e) => {
      const firstBoard = e.boards[0];
      const playType = firstBoard?.playType ?? "standard";
      return {
        entryId: e.entryId.slice(-6).toUpperCase(),
        time: e.createdAt,
        playType,
        playTypeLabel: LOTTO535_PLAY_TYPE_LABELS[playType as PlayType] ?? playType,
        mainNumbers: firstBoard?.mainNumbers ?? [],
        specialNumbers: firstBoard?.specialNumbers ?? [],
        amount: e.amount,
        username: e.username ?? "",
        tenant: e.tenantId,
      };
    });
  }, [liveData]);

  if (!draw || !ANALYTICS_SHOW.has(draw.status as any)) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Phân tích cược
      </h2>

      <PlayTypeCard distribution={playTypes} />

      <div className="grid gap-4 lg:grid-cols-[7fr_3fr] items-stretch">
        <NumberHeatmap
          mainNumbers={numberFreq?.main ?? []}
          specialNumbers={numberFreq?.special ?? []}
          topCombos={topCombosData?.combos}
          tenants={tenants}
        />
        <LiveFeed entries={liveFeed} isSettled={isSettled} />
      </div>
    </section>
  );
}
