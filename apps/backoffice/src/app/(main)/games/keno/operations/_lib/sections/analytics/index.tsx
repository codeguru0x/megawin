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
import { KENO_SIDE_BET_PLAY_TYPE_SET } from "@megawin/game-keno/entities";
import { KENO_PLAY_TYPE_LABELS } from "@megawin/game-keno/labels";

import type { LiveFeedEntry, TenantRow } from "../../types";
import { useDrawContext } from "../../use-draw-context";
import {
  useOpsLiveEntries,
  useOpsNumberFrequency,
  useOpsPlayTypeDistribution,
  useOpsTenantBreakdown,
  useOpsTopCombos,
} from "../../use-operations";
import { PlayTypeCard } from "./analytics-panels";
import { LiveFeed } from "./live-feed";
import { NumberHeatmap } from "./number-heatmap";

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
      label: KENO_PLAY_TYPE_LABELS[d.playType] ?? d.playType,
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
      // Lấy board cơ bản đầu tiên để hiển thị preview, fallback side bet nếu không có
      const firstBasicBoard = e.boards.find((b) => !KENO_SIDE_BET_PLAY_TYPE_SET.has(b.playType as any));
      const firstSideBetBoard = e.boards.find((b) => KENO_SIDE_BET_PLAY_TYPE_SET.has(b.playType as any));
      const previewBoard = firstBasicBoard ?? firstSideBetBoard;
      const isSideBet = !firstBasicBoard && !!firstSideBetBoard;
      return {
        entryId: e.entryId,
        time: e.createdAt,
        playType: previewBoard?.playType ?? "unknown",
        numbers: previewBoard?.numbers ?? [],
        // Side bet: map bet field để hiển thị cụ thể ("big", "small", "even", "odd", ...)
        bet: isSideBet ? (previewBoard as any)?.bet : undefined,
        amount: e.amount,
        username: e.username,
        tenant: e.tenantId,
      };
    });
  }, [liveData]);

  if (!draw || !ANALYTICS_SHOW.has(draw.status as any)) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Phân tích cược</h2>

      <PlayTypeCard playTypes={playTypes} />

      <div className="grid gap-4 lg:grid-cols-[7fr_3fr] items-stretch">
        <NumberHeatmap numbers={numberFreq} combos={topCombos} tenants={tenants} />
        <LiveFeed entries={liveEntries} totalCount={liveData?.totalCount ?? 0} isSettled={isSettled} />
      </div>
    </section>
  );
}
