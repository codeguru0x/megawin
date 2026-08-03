"use client";

/**
 * Keno Operations — Analytics Section (tab Phân tích cược)
 *
 * Đọc snapshot (timer 1) qua `select` slice cho từng panel — panel này đổi không
 * kéo panel khác re-render (§4.2). Live feed dùng **timer 2** (`useLiveFeed`),
 * chỉ chạy khi tab Phân tích mở & kỳ chưa settle.
 *
 * Layout (plan p0-07 §3, cập nhật §4.8):
 *   PlayTypeCard (pick grid + side-bet pair cards) → NumberHeatmap (chọn số + combo
 *   lookup dialog, thuần tương tác) → cụm 3 cột rủi ro [Top người chơi | Top phải trả |
 *   Bộ số phổ biến] → [Cược gần nhất (feed cột rộng, chia nhóm Pick/Side bet) | Đại lý
 *   (card hẹp)] 2 cột.
 */

import { useMemo } from "react";

import { KENO_SIDE_BET_PLAY_TYPE_SET } from "@megawin/game-keno/entities";

import {
  toNumberFreq,
  toPlayTypeRows,
  toSideBetPairs,
  toTenantRows,
  toTopAccounts,
  toTopCombos,
  toTopPotential,
} from "../../adapters";
import { SIDEBET_SKEW_PCT_DEFAULT } from "../../ops-constants";
import type {
  LiveFeedEntry,
  NumberFreqItem,
  PlayTypeRow,
  SideBetPair,
  TenantRow,
  TopAccountRow,
  TopComboRow,
  TopPotentialRow,
} from "../../types";
import { useDrawContext } from "../../use-draw-context";
import { useLiveFeed, useOpsSnapshot } from "../../use-operations";
import { PlayTypeCard, TenantBreakdownCard, TopRiskPanel } from "./analytics-panels";
import { LiveFeed } from "./live-feed";
import { NumberHeatmap } from "./number-heatmap";

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * @param active - Tab Phân tích đang mở. Gate `useLiveFeed` (timer 2) — chỉ poll
 *   live entries khi staff thực sự xem tab này.
 */
export function AnalyticsSection({ active }: { active: boolean }) {
  const { effectiveDrawId, isSettled } = useDrawContext();

  // Mỗi slice 1 `select` → panel đổi không kéo panel khác re-render (query dedupe).
  const { data: playTypes } = useOpsSnapshot<PlayTypeRow[]>(effectiveDrawId, isSettled, (s) =>
    s.stats ? toPlayTypeRows(s.stats) : [],
  );
  const { data: sideBetPairs } = useOpsSnapshot<SideBetPair[]>(effectiveDrawId, isSettled, (s) =>
    s.stats ? toSideBetPairs(s.stats) : [],
  );
  // Ngưỡng lệch side bet (%) từ config — tô màu progress bar đúng cấu hình (§4.3).
  const { data: sidebetSkewPct } = useOpsSnapshot<number>(
    effectiveDrawId,
    isSettled,
    (s) => s.thresholds.sidebetSkewPct,
  );
  const { data: numberFreq } = useOpsSnapshot<NumberFreqItem[]>(effectiveDrawId, isSettled, (s) =>
    s.stats ? toNumberFreq(s.stats) : [],
  );
  const { data: topCombos } = useOpsSnapshot<TopComboRow[]>(effectiveDrawId, isSettled, (s) =>
    toTopCombos(s.topCombos),
  );
  const { data: topAccounts } = useOpsSnapshot<TopAccountRow[]>(effectiveDrawId, isSettled, (s) =>
    toTopAccounts(s.topAccounts),
  );
  const { data: topPotential } = useOpsSnapshot<TopPotentialRow[]>(
    effectiveDrawId,
    isSettled,
    (s) => (s.stats ? toTopPotential(s.stats) : []),
  );
  const { data: tenants } = useOpsSnapshot<TenantRow[]>(effectiveDrawId, isSettled, (s) =>
    s.stats ? toTenantRows(s.stats) : [],
  );

  // Timer 2 — chỉ chạy khi tab mở & chưa settle (analysis §4.2).
  const { data: liveData } = useLiveFeed(effectiveDrawId, active && !isSettled);

  const liveEntries: LiveFeedEntry[] = useMemo(() => {
    if (!liveData) return [];
    return liveData.entries.map((e) => {
      // Lấy board cơ bản đầu tiên để hiển thị preview, fallback side bet nếu không có.
      const firstBasicBoard = e.boards.find(
        (b) => !KENO_SIDE_BET_PLAY_TYPE_SET.has(b.playType as never),
      );
      const firstSideBetBoard = e.boards.find((b) =>
        KENO_SIDE_BET_PLAY_TYPE_SET.has(b.playType as never),
      );
      const previewBoard = firstBasicBoard ?? firstSideBetBoard;
      const isSideBet = !firstBasicBoard && !!firstSideBetBoard;
      return {
        entryId: e.entryId,
        time: e.createdAt,
        playType: previewBoard?.playType ?? "unknown",
        numbers: previewBoard?.numbers ?? [],
        // Side bet: map bet field để hiển thị cụ thể ("big", "small", "even", "odd", ...).
        bet: isSideBet ? (previewBoard as { bet?: string })?.bet : undefined,
        amount: e.amount,
        username: e.username,
        tenant: e.tenantId,
      };
    });
  }, [liveData]);

  if (!effectiveDrawId) return null;

  return (
    <section className="space-y-4">
      <PlayTypeCard
        playTypes={playTypes ?? []}
        sideBetPairs={sideBetPairs ?? []}
        sidebetSkewPct={sidebetSkewPct ?? SIDEBET_SKEW_PCT_DEFAULT}
      />

      <NumberHeatmap numbers={numberFreq ?? []} drawId={effectiveDrawId} />

      {/* Cụm 3 cột rủi ro/concentration: Top người chơi | Top phải trả | Bộ số phổ biến
          (§4.8 — cùng bản chất "bảng xếp hạng", gom 1 cụm thay vì chôn combo trong heatmap). */}
      <TopRiskPanel
        drawId={effectiveDrawId}
        topAccounts={topAccounts ?? []}
        topPotential={topPotential ?? []}
        topCombos={topCombos ?? []}
      />

      {/* Cược gần nhất (feed, cột rộng chính — dữ liệu live hữu ích, cần diện tích) +
          Đại lý (card hẹp phải — RGS B2B ít tenant, card giàu thông tin thay bảng trống) (§4.8). */}
      <div className="grid gap-4 @[900px]/main:grid-cols-[1fr_24rem] items-start">
        <LiveFeed
          entries={liveEntries}
          totalCount={liveData?.totalCount ?? 0}
          isSettled={isSettled}
        />
        <TenantBreakdownCard tenants={tenants ?? []} />
      </div>
    </section>
  );
}
