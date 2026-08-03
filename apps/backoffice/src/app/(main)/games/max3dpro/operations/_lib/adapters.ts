/**
 * Max 3D Pro Operations — Adapters
 *
 * Map slice của betting-stats snapshot → UI view models. Pure functions — gọi trong
 * `select` của `useOpsSnapshot` hoặc `useMemo`, dùng chung 1 nguồn.
 *
 * Honest-data: `uniquePlayers` từ `max3dpro_draw_account_stats` (đếm distinct, snapshot cấp);
 * `potentialWin` là PROXY (UI ghi "ước tính").
 */

import type {
  Max3dproDrawBettingStatsEntity,
  Max3dproPlayTypeStat,
  TopAccountStat,
} from "@megawin/game-max3dpro/entities";
import type { Max3dproExposureResult } from "@megawin/game-max3dpro/rules";

import type {
  OpsKpi,
  PairRow,
  PlayTypeRow,
  TenantRow,
  TopAccountRow,
  TopPotentialRow,
  TopTripletRow,
} from "./types";

type Stats = Max3dproDrawBettingStatsEntity;

// ─── KPI ─────────────────────────────────────────────────────────────────────

/** KPI strip từ `totals` + Σ units 2 nhóm + `uniquePlayers` (từ snapshot, đếm distinct). */
export function toKpi(stats: Stats, uniquePlayers: number | null): OpsKpi {
  const bp = stats.byPlayType;
  return {
    totalRevenue: stats.totals.revenue,
    totalEntries: stats.totals.entries,
    totalBetUnits: bp.multiNumber.units + bp.multiDigit.units,
    uniquePlayers,
    totalCommission: stats.totals.commission,
  };
}

// ─── Play type distribution (4 nhóm) ─────────────────────────────────────────

/** Nhãn 2 nhóm play mode — thứ tự hiển thị cố định. */
const PLAY_TYPE_GROUPS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "multiNumber", label: "Bao nhiều bộ số" },
  { key: "multiDigit", label: "Bao bộ ba số" },
];

export function toPlayTypeRows(stats: Stats): PlayTypeRow[] {
  const bp = stats.byPlayType as unknown as Record<string, Max3dproPlayTypeStat>;
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
      units: s.units,
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
  exposure: Max3dproExposureResult,
  thresholds: { pairLiabilityWarnAmount: number; comboAccountsWarn: number },
  limit = 20,
): PairRow[] {
  return exposure.topPairLiabilities.slice(0, limit).map((p) => ({
    pairKey: p.pairKey,
    first: p.first,
    second: p.second,
    unitsForward: p.unitsForward,
    unitsReverse: p.unitsReverse,
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

/** `topAccounts` (từ snapshot, derive `max3dpro_draw_account_stats` sort tiền desc) → rows. */
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
