"use client";

/**
 * Keno Operations — Analytics Section
 *
 * PlayTypeCard: phân bổ 12 kiểu chơi (pick1-10, bigSmall, evenOdd).
 * NumberHeatmap: tần suất 80 số (grid 10×8) + top combos.
 * TenantBreakdown: doanh thu theo đại lý.
 * LiveFeed: cược gần nhất real-time.
 *
 * Keno khác Mega 6/45:
 * - 12 kiểu chơi (pick1-pick10 + bigSmall + evenOdd)
 * - 80 số (01-80), grid 10×8
 * - Side bets không có "combo" concept
 */

import { useMemo } from "react";
import { DrawStatus } from "@megawin/game-core/entities";
import { KenoPlayType } from "@megawin/game-keno/entities";

import { useDrawContext } from "../../use-draw-context";
import {
  useOpsPlayTypeDistribution,
  useOpsTenantBreakdown,
  useOpsNumberFrequency,
  useOpsTopCombos,
  useOpsLiveEntries,
} from "../../use-operations";
import { PlayTypeCard, TenantBreakdownCard } from "./analytics-panels";
import { NumberHeatmap } from "./number-heatmap";
import { LiveFeed } from "./live-feed";

import type { TenantRow, LiveFeedEntry } from "../../types";

// ─── PlayType Labels — Keno ───────────────────────────────────────────────────

const PLAY_TYPE_LABELS: Record<string, string> = {
  [KenoPlayType.Pick1]: "Pick 1",
  [KenoPlayType.Pick2]: "Pick 2",
  [KenoPlayType.Pick3]: "Pick 3",
  [KenoPlayType.Pick4]: "Pick 4",
  [KenoPlayType.Pick5]: "Pick 5",
  [KenoPlayType.Pick6]: "Pick 6",
  [KenoPlayType.Pick7]: "Pick 7",
  [KenoPlayType.Pick8]: "Pick 8",
  [KenoPlayType.Pick9]: "Pick 9",
  [KenoPlayType.Pick10]: "Pick 10",
  [KenoPlayType.BigSmall]: "Lớn/Nhỏ",
  [KenoPlayType.EvenOdd]: "Chẵn/Lẻ",
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

  // ── Adapters ──────────────────────────────────────────────────────────────

  const playTypes = useMemo(() => {
    if (!playtypeData) return [];
    const totalSelections = playtypeData.distribution.reduce((a, d) => a + d.selectionCount, 0);
    return playtypeData.distribution.map((d) => ({
      playType: d.playType,
      label: PLAY_TYPE_LABELS[d.playType] ?? d.playType,
      entries: d.entryCount,
      selections: d.selectionCount,
      revenue: d.revenue,
      pct: totalSelections > 0 ? (d.selectionCount / totalSelections) * 100 : 0,
    }));
  }, [playtypeData]);

  const tenants: TenantRow[] = useMemo(() => {
    if (!tenantData) return [];
    const totalRevenue = tenantData.tenants.reduce((a, t) => a + t.revenue, 0);
    return tenantData.tenants.map((t) => ({
      tenantId: t.tenantId,
      entries: t.entries,
      boards: t.boards,
      players: t.players,
      revenue: t.revenue,
      commission: t.commission,
      pct: totalRevenue > 0 ? (t.revenue / totalRevenue) * 100 : 0,
    }));
  }, [tenantData]);

  // Keno: 80 số (01-80)
  const numberFreq = useMemo(() => {
    if (!freqData) return [];
    return freqData.numbers.map((f) => ({
      number: f.number,
      count: f.count,
      entries: f.entries,
      amount: f.revenue,
    }));
  }, [freqData]);

  const topCombos = useMemo(() => topCombosData?.combos ?? [], [topCombosData]);

  const liveEntries: LiveFeedEntry[] = useMemo(() => {
    if (!liveData) return [];
    return liveData.entries.map((e) => {
      // Lấy board đầu tiên để hiển thị preview
      const firstBoard = e.boards[0];
      const firstSideBet = e.sideBets[0];
      const playType = firstBoard?.playType ?? firstSideBet?.playType ?? "unknown";
      return {
        entryId: e.entryId,
        time: e.createdAt,
        playType,
        numbers: firstBoard?.numbers ?? [],
        amount: e.amount,
        username: e.username,
        tenant: e.tenantId,
      };
    });
  }, [liveData]);

  if (!draw || !ANALYTICS_SHOW.has(draw.status as any)) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Phân tích
      </h2>
      <div className="grid gap-4 xl:grid-cols-2">
        <PlayTypeCard playTypes={playTypes} />
        <TenantBreakdownCard tenants={tenants} />
      </div>
      <NumberHeatmap numbers={numberFreq} combos={topCombos} drawId={effectiveDrawId} />
      <LiveFeed
        entries={liveEntries}
        totalCount={liveData?.totalCount ?? 0}
        isSettled={isSettled}
      />
    </section>
  );
}
