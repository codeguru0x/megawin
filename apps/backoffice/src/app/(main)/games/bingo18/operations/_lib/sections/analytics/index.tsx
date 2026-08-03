"use client";

/**
 * Bingo 18 Operations — Analytics Section (tab Phân tích cược)
 *
 * Thứ tự panel (guideline §5 — rủi ro TRƯỚC, monitoring SAU):
 *   1. PlayTypeCard — phân bổ 6 nhóm kiểu chơi (tripleMatch tách specific/any).
 *   2. DiceBoard (6 ô, thuần hiển thị) + SumTotalBar (16 cột) + SideBetCard (3 hướng).
 *   3. RiskCluster — [Top người chơi | Top phải trả tiềm năng].
 *   4. [Live feed (rộng) | Đại lý (hẹp)].
 *
 * Data: TOÀN BỘ từ snapshot (timer 1) qua `select` slice + adapters — KHÔNG aggregation
 * on-demand. Live feed là timer 2, CHỈ chạy khi tab này mở && kỳ chưa settle.
 */

import { useMemo } from "react";

import { BINGO18_BASIC_PLAY_TYPE_SET } from "@megawin/game-bingo18/entities";
import type { LiveEntryItem } from "@megawin/game-bingo18-application/use-cases/operations";
import { DrawStatus } from "@megawin/game-core/entities";

import {
  toDiceCells,
  toPlayTypeRows,
  toSideBetSplit,
  toSumBars,
  toTenantRows,
  toTopAccounts,
  toTopPotential,
} from "../../adapters";
import type { LiveFeedEntry } from "../../types";
import { useDrawContext } from "../../use-draw-context";
import { useOpsLiveEntries, useOpsSnapshot } from "../../use-operations";
import { PlayTypeCard } from "./analytics-panels";
import { DiceBoard } from "./dice-histogram";
import { LiveFeed } from "./live-feed";
import { RiskCluster } from "./risk-cluster";
import { SideBetCard, SumTotalBar } from "./sum-side-panels";
import { TenantPanel } from "./tenant-panel";

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

  // Slice snapshot → view models (adapter thuần chạy trong select — chỉ tính lại khi
  // snapshot data đổi; 304 giữ reference → 0 re-render). `topAccounts` là field CẤP
  // SNAPSHOT (derive từ bingo18_draw_account_stats, p0-03), KHÔNG phải `s.stats.topAccounts`.
  const { data: view } = useOpsSnapshot(effectiveDrawId, isSettled, (s) =>
    s.stats
      ? {
          playTypes: toPlayTypeRows(s.stats),
          diceCells: toDiceCells(s.stats),
          sumBars: toSumBars(s.stats),
          sideBetSplit: toSideBetSplit(s.stats),
          tenants: toTenantRows(s.stats),
          topAccounts: toTopAccounts(s.topAccounts),
          topPotential: toTopPotential(s.stats),
          thresholds: s.thresholds,
        }
      : null,
  );

  // Timer 2: live feed — CHỈ khi tab Phân tích mở && kỳ chưa settle.
  const { data: liveData } = useOpsLiveEntries(effectiveDrawId, active && !isSettled);

  const liveEntries: LiveFeedEntry[] = useMemo(() => {
    if (!liveData) return [];
    return liveData.entries.map((e: LiveEntryItem) => {
      // boards[] chứa cả cơ bản và bổ sung — lấy board đầu tiên làm preview.
      const firstBoard = e.boards[0];
      const rawType = firstBoard?.playType ?? "unknown";
      // Key hoá tripleMatch theo tripleKind
      const playType =
        rawType === "tripleMatch" && firstBoard
          ? `tripleMatch-${(firstBoard as any).tripleKind ?? "any"}`
          : rawType;
      return {
        entryId: e.entryId,
        time: e.createdAt,
        playType,
        numbers:
          firstBoard &&
          BINGO18_BASIC_PLAY_TYPE_SET.has(firstBoard.playType) &&
          (firstBoard as any).number !== undefined
            ? [(firstBoard as any).number as number]
            : [],
        sum: rawType === "sumTotal" ? ((firstBoard as any).sum as number | undefined) : undefined,
        bet:
          rawType === "bigSmallDraw" ? ((firstBoard as any).bet as string | undefined) : undefined,
        amount: e.amount,
        username: e.username,
        tenant: e.tenantId,
      };
    });
  }, [liveData]);

  if (!draw || !ANALYTICS_SHOW.has(draw.status as string)) return null;

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

      {/* 2. Bảng xúc xắc 6 ô + phân bổ Cộng tổng + Lớn/Hòa/Nhỏ */}
      <div className="grid gap-4 @[64rem]/main:grid-cols-2">
        <DiceBoard cells={view.diceCells} />
        <SideBetCard split={view.sideBetSplit} skewPct={view.thresholds.sidebetSkewPct} />
      </div>
      <SumTotalBar
        bars={view.sumBars}
        concentrationThreshold={view.thresholds.bucketConcentrationAmount}
      />

      {/* 3. Cụm rủi ro — TRƯỚC monitoring (guideline §5) */}
      <RiskCluster
        drawId={effectiveDrawId}
        topAccounts={view.topAccounts}
        topPotential={view.topPotential}
      />

      {/* 4. [Live feed (rộng) | Đại lý (hẹp)] */}
      <div className="grid items-start gap-4 @[64rem]/main:[grid-template-columns:1fr_24rem]">
        <LiveFeed
          entries={liveEntries}
          totalCount={liveData?.totalCount ?? 0}
          isSettled={isSettled}
          largeBetThreshold={view.thresholds.largeBetAmount}
        />
        <TenantPanel tenants={view.tenants} />
      </div>
    </section>
  );
}
