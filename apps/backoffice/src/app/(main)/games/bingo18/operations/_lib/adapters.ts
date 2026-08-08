/**
 * Bingo 18 Operations — Adapters
 *
 * Map slice của betting-stats snapshot → UI view models (KpiStrip / PlayTypeCard /
 * DiceBoard / SumBar / SideBetCard / RiskCluster / TenantPanel). Pure functions —
 * gọi trong `select` của `useOpsSnapshot` hoặc `useMemo`, dùng chung 1 nguồn.
 *
 * `topAccounts`/`uniquePlayers` là field CẤP SNAPSHOT (derive từ `bingo18_draw_account_stats`,
 * p0-03) — KHÔNG còn nằm trong `stats.topAccounts` (đã xoá field, top-K tích luỹ không thể
 * seed lại chính xác trong doc).
 */

import { Bingo18BigSmallBet } from "@megawin/game-bingo18/entities";
import type { Bingo18BucketStat, Bingo18DrawBettingStatsEntity, TopAccountStat } from "@megawin/game-bingo18/entities";
import {
  BINGO18_BIG_SMALL_BET_LABELS,
  BINGO18_PLAY_TYPE_LABELS,
  BINGO18_TRIPLE_KIND_LABELS,
} from "@megawin/game-bingo18/labels";

import type {
  DiceCellItem,
  OpsKpi,
  PlayTypeRow,
  SideBetSplit,
  SumBarItem,
  TenantRow,
  TopAccountRow,
  TopPotentialRow,
} from "./types";

type Stats = Bingo18DrawBettingStatsEntity;

/** Cộng amount/sets/entries của 1 nhóm bucket Record. */
function sumBuckets(rec: Record<string, Bingo18BucketStat>): Bingo18BucketStat {
  let amount = 0;
  let sets = 0;
  let entries = 0;
  for (const b of Object.values(rec)) {
    amount += b.amount;
    sets += b.sets;
    entries += b.entries;
  }
  return { amount, sets, entries };
}

// ─── KPI ─────────────────────────────────────────────────────────────────────

/**
 * KPI strip từ `totals` + tách basic/side bet từ bucket.
 *
 * @param uniquePlayers - Số THẬT (`countDocuments` trên `bingo18_draw_account_stats`,
 *   1 doc/account) — field cấp snapshot, KHÔNG suy ra từ `stats`.
 */
export function toKpi(stats: Stats, uniquePlayers: number): OpsKpi {
  const bp = stats.byPlayType;
  const sideBets =
    sumBuckets(bp.sumTotal).sets + bp.bigSmallDraw.big.sets + bp.bigSmallDraw.draw.sets + bp.bigSmallDraw.small.sets;
  return {
    totalRevenue: stats.totals.revenue,
    totalEntries: stats.totals.entries,
    totalBasicSets: stats.totals.sets - sideBets,
    totalSideBets: sideBets,
    uniquePlayers,
    totalCommission: stats.totals.commission,
  };
}

// ─── Play type distribution (5 kiểu, tripleMatch tách specific/any) ──────────

export function toPlayTypeRows(stats: Stats): PlayTypeRow[] {
  const bp = stats.byPlayType;
  const single = sumBuckets(bp.singleNum);
  const dbl = sumBuckets(bp.doubleMatch);
  const tripleSpec = sumBuckets(bp.tripleMatch.specific);
  const tripleAny = bp.tripleMatch.any;
  const sumTotal = sumBuckets(bp.sumTotal);
  const bigSmall = {
    amount: bp.bigSmallDraw.big.amount + bp.bigSmallDraw.draw.amount + bp.bigSmallDraw.small.amount,
    sets: bp.bigSmallDraw.big.sets + bp.bigSmallDraw.draw.sets + bp.bigSmallDraw.small.sets,
    entries: bp.bigSmallDraw.big.entries + bp.bigSmallDraw.draw.entries + bp.bigSmallDraw.small.entries,
  };

  const rows: PlayTypeRow[] = [
    { playType: "singleNum", label: BINGO18_PLAY_TYPE_LABELS.singleNum, ...toRowStat(single) },
    { playType: "doubleMatch", label: BINGO18_PLAY_TYPE_LABELS.doubleMatch, ...toRowStat(dbl) },
    {
      playType: "tripleMatch-specific",
      label: BINGO18_TRIPLE_KIND_LABELS.specific,
      ...toRowStat(tripleSpec),
    },
    { playType: "tripleMatch-any", label: BINGO18_TRIPLE_KIND_LABELS.any, ...toRowStat(tripleAny) },
    { playType: "sumTotal", label: BINGO18_PLAY_TYPE_LABELS.sumTotal, ...toRowStat(sumTotal) },
    {
      playType: "bigSmallDraw",
      label: BINGO18_PLAY_TYPE_LABELS.bigSmallDraw,
      ...toRowStat(bigSmall),
    },
  ];

  const totalRevenue = rows.reduce((a, r) => a + r.revenue, 0);
  for (const r of rows) {
    r.pct = totalRevenue > 0 ? (r.revenue / totalRevenue) * 100 : 0;
  }
  return rows;
}

function toRowStat(b: Bingo18BucketStat): Pick<PlayTypeRow, "entries" | "sets" | "revenue" | "pct"> {
  return { entries: b.entries, sets: b.sets, revenue: b.amount, pct: 0 };
}

// ─── Dice board 6 ô (thuần hiển thị) ─────────────────────────────────────────

/**
 * 6 ô xúc xắc: Dòng tiền + số bộ = tổng singleNum + doubleMatch + tripleMatch.specific
 * cùng key "1".."6" (heatmap dựng từ bucket ở tầng đọc — KHÔNG lưu numberFreq riêng).
 * KHÔNG per-number liability (guideline §3.3).
 */
export function toDiceCells(stats: Stats): DiceCellItem[] {
  const bp = stats.byPlayType;
  return [1, 2, 3, 4, 5, 6].map((n) => {
    const key = String(n);
    const parts = [bp.singleNum[key], bp.doubleMatch[key], bp.tripleMatch.specific[key]];
    let amount = 0;
    let sets = 0;
    for (const p of parts) {
      if (!p) continue;
      amount += p.amount;
      sets += p.sets;
    }
    return { diceValue: n, amount, sets };
  });
}

// ─── SumTotal bar 16 cột ─────────────────────────────────────────────────────

/** Bucket nhân cao của sumTotal: tổng 3 và 18 (×120) — khớp BINGO18_HIGH_MULTIPLIER_BUCKETS. */
const HIGH_SUMS = new Set([3, 18]);

export function toSumBars(stats: Stats): SumBarItem[] {
  const st = stats.byPlayType.sumTotal;
  return Array.from({ length: 16 }, (_, i) => {
    const sum = i + 3;
    const b = st[String(sum)];
    return {
      sum,
      amount: b?.amount ?? 0,
      sets: b?.sets ?? 0,
      isHighMultiplier: HIGH_SUMS.has(sum),
    };
  });
}

// ─── Side bet 3 hướng ────────────────────────────────────────────────────────

export function toSideBetSplit(stats: Stats): SideBetSplit {
  const d = stats.byPlayType.bigSmallDraw;
  return {
    big: { label: BINGO18_BIG_SMALL_BET_LABELS[Bingo18BigSmallBet.Big], amount: d.big.amount },
    draw: { label: BINGO18_BIG_SMALL_BET_LABELS[Bingo18BigSmallBet.Draw], amount: d.draw.amount },
    small: {
      label: BINGO18_BIG_SMALL_BET_LABELS[Bingo18BigSmallBet.Small],
      amount: d.small.amount,
    },
    total: d.big.amount + d.draw.amount + d.small.amount,
  };
}

// ─── Tenant breakdown ────────────────────────────────────────────────────────

/** `byTenant` (Record) → TenantRow[] sort revenue desc. */
export function toTenantRows(stats: Stats): TenantRow[] {
  const entries = Object.entries(stats.byTenant);
  const total = entries.reduce((a, [, v]) => a + v.amount, 0);
  return entries
    .map(([tenantId, v]) => ({
      tenantId,
      entries: v.entries,
      revenue: v.amount,
      commission: v.commission,
      pct: total > 0 ? (v.amount / total) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

// ─── Top risk ────────────────────────────────────────────────────────────────

/**
 * `snapshot.topAccounts` → TopAccountRow[].
 *
 * Nguồn là **field cấp snapshot** (derive từ `bingo18_draw_account_stats`), KHÔNG phải
 * `stats.topAccounts` (field đã xoá khỏi doc — p0-03). BE đã sort tiền desc.
 */
export function toTopAccounts(topAccounts: TopAccountStat[]): TopAccountRow[] {
  return topAccounts.map((a) => ({
    accountId: a.accountId,
    username: a.username,
    amount: a.amount,
    entries: a.entries,
  }));
}

/** `topPotential` → TopPotentialRow[] (đã sort potentialWin desc phía worker). */
export function toTopPotential(stats: Stats): TopPotentialRow[] {
  return stats.topPotential.map((p) => ({
    entryId: p.entryId,
    accountId: p.accountId,
    username: p.username,
    amount: p.amount,
    potentialWin: p.potentialWin,
  }));
}
