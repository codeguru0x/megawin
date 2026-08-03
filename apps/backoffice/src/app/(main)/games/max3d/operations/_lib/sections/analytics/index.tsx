"use client";

/**
 * Max 3D Operations — Analytics Section (tab Phân tích cược)
 *
 * Thứ tự panel (rủi ro TRƯỚC, monitoring SAU):
 *   1. PlayTypeCard — 4 nhóm (straight/combo3/combo6/plus).
 *   2. PairTable (RỦI RO SỐ 1 — liability ĐB per-cặp) + TopTripletsCard.
 *   3. RiskCluster — [Top người chơi | Top phải trả (ước tính)].
 *   4. [Live feed (rộng) | Đại lý (hẹp)].
 *
 * Data: TOÀN BỘ từ snapshot (timer 1) qua `select` slice + adapters — KHÔNG aggregation
 * on-demand. Live feed là timer 2, CHỈ chạy khi tab này mở && kỳ chưa settle.
 */

import { useMemo } from "react";

import { DrawStatus } from "@megawin/game-core/entities";
import { PlayMode, PlayType } from "@megawin/game-max3d/entities";
import { MAX3D_MODE_TYPE_LABELS } from "@megawin/game-max3d/labels";

import {
  toPairRows,
  toPlayTypeRows,
  toTenantRows,
  toTopAccounts,
  toTopPotential,
  toTopTriplets,
} from "../../adapters";
import type { LiveFeedEntry } from "../../types";
import { useDrawContext } from "../../use-draw-context";
import { useOpsLiveEntries, useOpsSnapshot } from "../../use-operations";
import { LiveFeed } from "./live-feed";
import { PairTable, PlayTypeCard, RiskCluster, TenantPanel, TopTripletsCard } from "./panels";

const ANALYTICS_SHOW = new Set<string>([
  DrawStatus.SalesOpen,
  DrawStatus.SalesClosed,
  DrawStatus.Published,
  DrawStatus.Settling,
  DrawStatus.Settled,
]);

/**
 * @param active - Tab Phân tích đang mở → bật timer live-feed. Tab đóng → 0 request.
 */
export function AnalyticsSection({ active }: { active: boolean }) {
  const { draw, effectiveDrawId, isSettled } = useDrawContext();

  // Slice snapshot → view models (adapter thuần trong select — 304 giữ reference → 0 re-render).
  const { data: view } = useOpsSnapshot(effectiveDrawId, isSettled, (s) =>
    s.stats
      ? {
          playTypes: toPlayTypeRows(s.stats),
          topTriplets: toTopTriplets(s.stats),
          pairRows: s.exposure ? toPairRows(s.exposure, s.thresholds) : [],
          tenants: toTenantRows(s.stats),
          topAccounts: toTopAccounts(s.topAccounts),
          topPotential: toTopPotential(s.stats),
          thresholds: s.thresholds,
        }
      : null,
  );

  // Timer 2: live feed — CHỈ khi tab Phân tích mở && kỳ chưa settle.
  const { data: liveData } = useOpsLiveEntries(effectiveDrawId, active && !isSettled);

  const liveFeed: LiveFeedEntry[] = useMemo(() => {
    if (!liveData) return [];
    return liveData.entries.map((e) => {
      const firstBoard = e.boards[0];
      const playMode = (firstBoard?.playMode ?? PlayMode.Basic) as PlayMode;
      const playType = (firstBoard?.playType ?? PlayType.Straight) as PlayType;
      const key = `${playMode}.${playType}`;
      return {
        entryId: e.entryId,
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

  if (!view) {
    return (
      <p className="rounded-xl border border-dashed bg-muted/10 px-4 py-6 text-center text-xs text-muted-foreground">
        Chưa có dữ liệu cược cho kỳ này.
      </p>
    );
  }

  return (
    <section className="space-y-4">
      {/* 1. Phân bổ kiểu chơi */}
      <PlayTypeCard playTypes={view.playTypes} />

      {/* 2. Rủi ro: cặp plus (số 1) + bộ ba bị dồn */}
      <div className="grid items-start gap-4 @[64rem]/main:grid-cols-2">
        <PairTable rows={view.pairRows} />
        <TopTripletsCard rows={view.topTriplets} />
      </div>

      {/* 3. Cụm rủi ro người chơi */}
      <RiskCluster
        drawId={effectiveDrawId}
        topAccounts={view.topAccounts}
        topPotential={view.topPotential}
      />

      {/* 4. [Live feed (rộng) | Đại lý (hẹp)] */}
      <div className="grid items-start gap-4 @[64rem]/main:[grid-template-columns:1fr_24rem]">
        <LiveFeed
          entries={liveFeed}
          isSettled={isSettled}
          largeBetThreshold={view.thresholds.largeBetAmount}
        />
        <TenantPanel tenants={view.tenants} />
      </div>
    </section>
  );
}
