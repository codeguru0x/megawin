/**
 * Max 3D Operations — Adapters
 *
 * Map slice của betting-stats snapshot → UI view models. Pure functions — gọi trong
 * `select` của `useOpsSnapshot` hoặc `useMemo`, dùng chung 1 nguồn.
 *
 * Honest-data: `uniquePlayers` = null (stats không có distinct count); `potentialWin`
 * là PROXY (UI ghi "ước tính").
 */

import type { Max3dDrawBettingStatsEntity, Max3dPlayTypeStat } from "@megawin/game-max3d/entities";
import type { TopAccountStat } from "@megawin/game-core/types";
import type { Max3dExposureResult } from "@megawin/game-max3d/rules";

import type {
  OpsKpi,
  PairRow,
  PlayTypeRow,
  TenantRow,
  TopAccountRow,
  TopPotentialRow,
  TopTripletRow,
} from "./types";

type Stats = Max3dDrawBettingStatsEntity;

// ─── KPI ─────────────────────────────────────────────────────────────────────

/** KPI strip từ `totals` + Σ units 4 nhóm. `uniquePlayers` = null (chỉ có top-K). */
export function toKpi(stats: Stats): OpsKpi {
  const bp = stats.byPlayType;
  return {
    totalRevenue: stats.totals.revenue,
    totalEntries: stats.totals.entries,
    totalBetUnits:
      bp.basicStraight.units + bp.basicCombo3.units + bp.basicCombo6.units + bp.plus.units,
    uniquePlayers: null,
    totalCommission: stats.totals.commission,
  };
}

// ─── Play type distribution (4 nhóm) ─────────────────────────────────────────

/** Nhãn 4 nhóm — thứ tự hiển thị cố định. */
const PLAY_TYPE_GROUPS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "basicStraight", label: "Cơ bản — Trùng khớp" },
  { key: "basicCombo3", label: "Cơ bản — Tổ hợp 3" },
  { key: "basicCombo6", label: "Cơ bản — Tổ hợp 6" },
  { key: "plus", label: "Max 3D+ (cặp bộ ba)" },
];

export function toPlayTypeRows(stats: Stats): PlayTypeRow[] {
  const bp = stats.byPlayType as unknown as Record<string, Max3dPlayTypeStat>;
  const rows: PlayTypeRow[] = PLAY_TYPE_GROUPS.map(({ key, label }) => {
    const s = bp[key] ?? { amount: 0, units: 0, boards: 0, entries: 0 };
    return { playType: key, label, entries: s.entries, units: s.units, revenue: s.amount, pct: 0 };
  });
  const total = rows.reduce((a, r) => a + r.revenue, 0);
  for (const r of rows) {
    r.pct = total > 0 ? (r.revenue / total) * 100 : 0;
  }
  return rows;
}

// ─── Top triplets (từ tripletStakes — thay heatmap on-demand cũ) ─────────────

/**
 * Top N triplet theo dòng tiền — bảng "Bộ ba bị dồn tiền". Liability tổng đã hiển thị
 * ở Exposure card (per-slot exact, server tính) — bảng này chỉ show dòng tiền + units.
 */
export function toTopTriplets(stats: Stats, limit = 20): TopTripletRow[] {
  return Object.entries(stats.tripletStakes)
    .map(([triplet, s]) => ({
      triplet,
      straightUnits: s.straightUnits,
      comboUnits: s.combo3Units + s.combo6Units,
      amount: s.amount,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

// ─── Pair table ──────────────────────────────────────────────────────────────

/**
 * Bảng cặp plus từ `exposure.topPairLiabilities` (đã sort liability desc, server tính)
 * + cờ vượt ngưỡng để UI tô màu theo config thực.
 */
export function toPairRows(
  exposure: Max3dExposureResult,
  thresholds: { pairLiabilityWarnAmount: number; comboAccountsWarn: number },
  limit = 20,
): PairRow[] {
  return exposure.topPairLiabilities.slice(0, limit).map((p) => ({
    pairKey: p.pairKey,
    triplet1: p.triplet1,
    triplet2: p.triplet2,
    units: p.units,
    accounts: p.accounts,
    amount: p.amount,
    liability: p.liability,
    overLiability: p.liability >= thresholds.pairLiabilityWarnAmount,
    overAccounts: p.accounts >= thresholds.comboAccountsWarn,
  }));
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
 * Top account theo tiền cược — nguồn `snapshot.topAccounts` (derive từ
 * `max3d_draw_account_stats`, p0-03) — KHÔNG còn đọc `stats.topAccounts` (field đã xoá).
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
