"use client";

/**
 * Bingo 18 Operations — Analytics Section
 *
 * PlayTypeCard: phân bổ 5 kiểu chơi (singleNum/doubleMatch/tripleMatch + sumTotal/bigSmallDraw).
 * DiceHistogram: tần suất 6 mặt xúc xắc + top side-bet combos.
 * TenantBreakdown: doanh thu theo đại lý.
 * LiveFeed: cược gần nhất real-time.
 *
 * Bingo 18 khác Keno:
 * - 5 kiểu chơi (3 basic + 2 side bet)
 * - Histogram 6 giá trị (1-6) thay vì heatmap 80 số
 * - Top combos là side-bet (sumTotal / bigSmallDraw) thay vì basic number
 */

import { useMemo } from "react";
import { DrawStatus } from "@megawin/game-core/entities";
import { BINGO18_PLAY_TYPE_LABELS, BINGO18_TRIPLE_KIND_LABELS } from "@megawin/game-bingo18/labels";

import { useDrawContext } from "../../use-draw-context";
import {
  useOpsPlayTypeDistribution,
  useOpsTenantBreakdown,
  useOpsDiceFrequency,
  useOpsTopCombos,
  useOpsLiveEntries,
} from "../../use-operations";
import { PlayTypeCard } from "./analytics-panels";
import { DiceHistogram } from "./dice-histogram";
import { LiveFeed } from "./live-feed";

import type { TenantRow, LiveFeedEntry } from "../../types";
import type {
  PlayTypeDistributionItem,
  TenantBreakdownItem,
  DiceFrequencyItem,
  LiveEntryItem,
} from "@megawin/game-bingo18-application/use-cases/operations";

/** Compound key labels for tripleMatch subtypes in analytics */
const BINGO18_ANALYTICS_LABELS: Record<string, string> = {
  ...BINGO18_PLAY_TYPE_LABELS,
  "tripleMatch-specific": BINGO18_TRIPLE_KIND_LABELS["specific"],
  "tripleMatch-any": BINGO18_TRIPLE_KIND_LABELS["any"],
};

const ANALYTICS_SHOW = new Set([
  DrawStatus.SalesOpen,
  DrawStatus.SalesClosed,
  DrawStatus.Published,
  DrawStatus.Settling,
  DrawStatus.Settled,
]);

export function AnalyticsSection() {
  const { draw, effectiveDrawId, isSettled, opsParams } = useDrawContext();

  const { data: playtypeData } = useOpsPlayTypeDistribution(opsParams, isSettled);
  const { data: tenantData } = useOpsTenantBreakdown(opsParams, isSettled);
  const { data: freqData } = useOpsDiceFrequency(opsParams, isSettled);
  const { data: topCombosData } = useOpsTopCombos(effectiveDrawId, isSettled);
  const { data: liveData } = useOpsLiveEntries(effectiveDrawId, isSettled);

  // ── Adapters ────────────────────────────────────────────────────────────────

  const playTypes = useMemo(() => {
    if (!playtypeData) return [];
    const totalSelections = playtypeData.distribution.reduce(
      (a: number, d: PlayTypeDistributionItem) => a + d.selectionCount,
      0,
    );
    return playtypeData.distribution.map((d: PlayTypeDistributionItem) => {
      // Key hoá riêng tripleMatch-specific vs tripleMatch-any
      const key =
        d.playType === "tripleMatch" && d.tripleKind ? `tripleMatch-${d.tripleKind}` : d.playType;
      return {
        playType: key,
        label: BINGO18_ANALYTICS_LABELS[key] ?? d.playType,
        entries: d.entryCount,
        selections: d.selectionCount,
        pct: totalSelections > 0 ? (d.selectionCount / totalSelections) * 100 : 0,
      };
    });
  }, [playtypeData]);

  const tenants: TenantRow[] = useMemo(() => {
    if (!tenantData) return [];
    const totalRevenue = tenantData.tenants.reduce(
      (a: number, t: TenantBreakdownItem) => a + t.revenue,
      0,
    );
    return tenantData.tenants.map((t: TenantBreakdownItem) => ({
      tenantId: t.tenantId,
      entries: t.entries,
      boards: t.boards,
      sideBets: t.sideBets,
      players: t.players,
      revenue: t.revenue,
      commission: t.commission,
      pct: totalRevenue > 0 ? (t.revenue / totalRevenue) * 100 : 0,
    }));
  }, [tenantData]);

  // Dice frequency: 6 giá trị (1-6)
  const diceFreq = useMemo(() => {
    if (!freqData) return [];
    return freqData.dice.map((f: DiceFrequencyItem) => ({
      diceValue: f.diceValue,
      count: f.count,
      entries: f.entries,
    }));
  }, [freqData]);

  const topCombos = useMemo(() => topCombosData?.combos ?? [], [topCombosData]);

  const liveEntries: LiveFeedEntry[] = useMemo(() => {
    if (!liveData) return [];
    return liveData.entries.map((e: LiveEntryItem) => {
      const firstBoard = e.boards[0];
      const firstSide = e.sideBets[0];
      const rawType = firstBoard?.playType ?? firstSide?.playType ?? "unknown";
      // Key hoá tripleMatch theo tripleKind
      const playType =
        rawType === "tripleMatch" && firstBoard
          ? `tripleMatch-${(firstBoard as any).tripleKind ?? "any"}`
          : rawType;
      return {
        entryId: e.entryId,
        time: e.createdAt,
        playType,
        // singleNum/doubleMatch có number; tripleMatch-specific có number; else []
        numbers:
          firstBoard && (firstBoard as any).number !== undefined
            ? [(firstBoard as any).number as number]
            : [],
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
        Phân tích cược
      </h2>

      <PlayTypeCard playTypes={playTypes} />

      <div className="grid gap-4 lg:grid-cols-[7fr_3fr] items-stretch">
        <DiceHistogram diceFreq={diceFreq} combos={topCombos} tenants={tenants} />
        <LiveFeed
          entries={liveEntries}
          totalCount={liveData?.totalCount ?? 0}
          isSettled={isSettled}
        />
      </div>
    </section>
  );
}
