"use client";

/**
 * Mega 6/45 Operations — Analytics Section
 *
 * PlayTypeCard: phân bổ 12 kiểu chơi Mega 6/45.
 * NumberHeatmap: tần suất 45 số chính + top combos + tenant breakdown.
 * LiveFeed: cược gần nhất real-time (không có specialNumbers).
 *
 * Mega 6/45: chỉ có mainNumbers, không có specialNumbers.
 */

import { useMemo } from "react";
import { DrawStatus } from "@megawin/game-core/entities";
import { PlayType } from "@megawin/game-mega645/entities";

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

// ─── Label maps — Mega 6/45 ───────────────────────────────────────────────────

const PLAY_TYPE_LABELS: Record<string, string> = {
  [PlayType.Standard]: "Chuẩn",
  [PlayType.Bao5]: "Bao 5",
  [PlayType.Bao7]: "Bao 7",
  [PlayType.Bao8]: "Bao 8",
  [PlayType.Bao9]: "Bao 9",
  [PlayType.Bao10]: "Bao 10",
  [PlayType.Bao11]: "Bao 11",
  [PlayType.Bao12]: "Bao 12",
  [PlayType.Bao13]: "Bao 13",
  [PlayType.Bao14]: "Bao 14",
  [PlayType.Bao15]: "Bao 15",
  [PlayType.Bao18]: "Bao 18",
  [PlayType.QuickPick]: "Chọn nhanh",
};

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
      label: PLAY_TYPE_LABELS[d.playType] ?? d.playType,
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

  // Mega 6/45: chỉ có mainNumbers, không có specialNumbers
  const numberFreq: NumberFreq[] = useMemo(() => {
    if (!freqData) return [];
    return freqData.mainNumbers.map((f) => ({
      number: String(f.number).padStart(2, "0"),
      count: f.count,
      lines: f.lines,
      amount: f.revenue,
    }));
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
        playTypeLabel: PLAY_TYPE_LABELS[playType] ?? playType,
        mainNumbers: firstBoard?.mainNumbers ?? [],
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
          mainNumbers={numberFreq}
          topCombos={topCombosData?.combos}
          tenants={tenants}
        />
        <LiveFeed entries={liveFeed} isSettled={isSettled} />
      </div>
    </section>
  );
}
