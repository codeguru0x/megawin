"use client";

/**
 * Power 6/55 Operations — Analytics Section
 *
 * Tab "Phân tích" — đọc TỪ SNAPSHOT (1 query + `select` slice per-section, KHÔNG còn 5 hook
 * aggregation cũ). Sections: PlayTypeCard (12 kiểu) · NumberHeatmap (55 số + combo lookup) ·
 * TopRiskPanel (top người chơi/phải trả/bộ số phổ biến) · TenantBreakdownCard · LiveFeed.
 *
 * `select` slice: đổi 1 section KHÔNG kéo section khác re-render (React Query dedupe 1 query).
 * LiveFeed đọc endpoint riêng (live entries KHÔNG nằm trong stats doc) nhưng DÙNG CHUNG nhịp
 * `tickSeconds` với snapshot (analysis §5.2, §6.1-D2) — lấy `pollSeconds` từ chính snapshot.
 */

import { DrawStatus } from "@megawin/game-core/entities";
import type { PlayType } from "@megawin/game-power655/entities";
import { POWER655_PLAY_TYPE_LABELS } from "@megawin/game-power655/labels";

import { toNumberFreq, toPlayTypeRows, toTenantRows, toTopAccounts, toTopCombos, toTopPotential } from "../../adapters";
import type {
  LiveFeedEntry,
  NumberFreqItem,
  PlayTypeRow,
  TenantRow,
  TopAccountRow,
  TopComboRow,
  TopPotentialRow,
} from "../../types";
import { useDrawContext } from "../../use-draw-context";
import type { LiveEntryItem } from "../../use-operations";
import { useOpsLiveEntries, useOpsSnapshot } from "../../use-operations";
import { PlayTypeCard, TenantBreakdownCard, TopRiskPanel } from "./analytics-panels";
import { LiveFeed } from "./live-feed";
import { NumberHeatmap } from "./number-heatmap";

/** Trạng thái kỳ được phép hiển thị tab phân tích (đã có/đang có cược hoặc đã settle). */
const ANALYTICS_SHOW = new Set<DrawStatus>([
  DrawStatus.SalesOpen,
  DrawStatus.SalesClosed,
  DrawStatus.Published,
  DrawStatus.Settling,
  DrawStatus.Settled,
]);

// ─── Component ────────────────────────────────────────────────────────────────

export function AnalyticsSection({ active }: { active: boolean }) {
  const { draw, effectiveDrawId, isSettled, status } = useDrawContext();

  // 1 snapshot query, mỗi section 1 `select` slice → tránh cross re-render.
  const { data: playTypes } = useOpsSnapshot<PlayTypeRow[]>(effectiveDrawId, isSettled, (s) =>
    s.stats ? toPlayTypeRows(s.stats) : [],
  );
  const { data: numberFreq } = useOpsSnapshot<NumberFreqItem[]>(effectiveDrawId, isSettled, (s) =>
    toNumberFreq(s.numberStats),
  );
  const { data: topCombos } = useOpsSnapshot<TopComboRow[]>(effectiveDrawId, isSettled, (s) =>
    toTopCombos(s.topCombos),
  );
  const { data: topAccounts } = useOpsSnapshot<TopAccountRow[]>(effectiveDrawId, isSettled, (s) =>
    toTopAccounts(s.topAccounts),
  );
  const { data: topPotential } = useOpsSnapshot<TopPotentialRow[]>(effectiveDrawId, isSettled, (s) =>
    s.stats ? toTopPotential(s.stats) : [],
  );
  const { data: tenants } = useOpsSnapshot<TenantRow[]>(effectiveDrawId, isSettled, (s) =>
    s.stats ? toTenantRows(s.stats) : [],
  );
  // Nhịp poll chung cho toàn trang (D2) — live feed khớp cadence snapshot, không hardcode.
  const { data: pollSeconds } = useOpsSnapshot<number>(effectiveDrawId, isSettled, (s) => s.pollSeconds);

  const { data: liveData } = useOpsLiveEntries(
    active && effectiveDrawId ? effectiveDrawId : undefined,
    isSettled,
    pollSeconds,
  );
  const liveFeed = toLiveFeed(liveData?.entries);

  if (!draw || !status || !ANALYTICS_SHOW.has(status)) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Phân tích cược</h2>

      <PlayTypeCard distribution={playTypes ?? []} />

      <div className="grid gap-4 lg:grid-cols-[7fr_3fr] items-stretch">
        <NumberHeatmap numbers={numberFreq ?? []} drawId={effectiveDrawId} />
        <LiveFeed entries={liveFeed} isSettled={isSettled} />
      </div>

      <TopRiskPanel
        drawId={effectiveDrawId}
        topAccounts={topAccounts ?? []}
        topPotential={topPotential ?? []}
        topCombos={topCombos ?? []}
      />

      {(tenants?.length ?? 0) > 0 && <TenantBreakdownCard tenants={tenants ?? []} />}
    </section>
  );
}

// ─── Live feed adapter (live entries → LiveFeedEntry) ────────────────────────

/** Suffix mô tả kiểu bao cho live feed — standard → không hiện, còn lại "(Bao N)". */
function baoSuffix(playType: string): string | undefined {
  if (playType === "standard") return undefined;
  return `(${POWER655_PLAY_TYPE_LABELS[playType as PlayType] ?? playType})`;
}

/** `live-entries.entries` → LiveFeedEntry[] — lấy board đầu tiên làm đại diện hiển thị. */
function toLiveFeed(entries: LiveEntryItem[] | undefined): LiveFeedEntry[] {
  if (!entries) return [];
  return entries.map((e) => {
    const firstBoard = e.boards[0];
    const playType = firstBoard?.playType ?? "standard";
    return {
      entryId: e.entryId,
      time: e.createdAt,
      playType,
      playTypeLabel: POWER655_PLAY_TYPE_LABELS[playType as PlayType] ?? playType,
      mainNumbers: firstBoard?.mainNumbers ?? [],
      suffix: baoSuffix(playType),
      amount: e.amount,
      username: e.username ?? "",
      tenant: e.tenantId,
    };
  });
}
