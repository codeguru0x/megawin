/**
 * Mega 6/45 Operations — Adapters
 *
 * Map slice của ops snapshot (`GetOpsSnapshotOutput`) → UI type hiện có (KHÔNG đổi render
 * contract của KpiStrip / PlayTypeCard / NumberHeatmap / TenantBreakdown). Pure functions —
 * gọi trong `useMemo` ở section, dùng chung 1 nguồn. Mirror `power655/operations/_lib/adapters.ts`.
 *
 * Quyết định honest-data (KHÔNG bịa số khi stats thiếu):
 * - Tenant `sets`/`players`: `byTenant` (TenantBettingStat) chỉ có {amount, entries, commission}
 *   → `null` (TenantBreakdown ẩn cột / render "—").
 */

import { DrawStatus } from "@megawin/game-core/entities";
import type {
  Mega645DrawBettingStatsEntity,
  Mega645DrawNumberStatsEntity,
  PlayType,
  TopAccountStat,
} from "@megawin/game-mega645/entities";
import type { Mega645TopCombo } from "@megawin/game-mega645-application/use-cases/operations";
import { MEGA645_PLAY_TYPE_LABELS } from "@megawin/game-mega645/labels";
import { PLAY_TYPE_CONFIGS } from "@megawin/game-mega645/rules";

import type {
  ExposureView,
  NumberFreqItem,
  OpsKpi,
  PlayTypeRow,
  TenantRow,
  TopAccountRow,
  TopComboRow,
  TopPotentialRow,
} from "./types";

type Stats = Mega645DrawBettingStatsEntity;

// ─── KPI ─────────────────────────────────────────────────────────────────────

/** Số chính thức từ settle (`DrawDoc`) — slice tối thiểu adapter cần, KHÔNG kéo cả `GetDrawDetailOutput`. */
export interface OfficialFinancialSlice {
  /** `DrawDoc.financial` — undefined khi chưa settle / kỳ Void. */
  financial?: { totalRevenue: number; totalAgentCommission: number };
  /** `DrawDoc.stats.ticketEntryCount` — số entry chính thức (totalSettled, đã loại void). */
  ticketEntryCount?: number;
}

/**
 * KPI strip — hợp nhất 2 nguồn (mirror Power 6/55/Keno §5.3): kỳ `Settled` ưu tiên số
 * CHÍNH THỨC từ settle (`financial`/`stats` trên `DrawDoc`); live/Settling/Void dùng ops
 * stats. `uniquePlayers` luôn từ snapshot (`countDocuments` trên `mega645_draw_account_stats`).
 * `totalSets` luôn từ ops — settle không ghi số bộ cược.
 *
 * Guard: CHỈ override khi `status === Settled` VÀ `official.financial` tồn tại.
 */
export function toKpi(
  stats: Stats,
  uniquePlayers: number,
  status: DrawStatus | undefined,
  official: OfficialFinancialSlice | undefined,
): OpsKpi {
  const t = stats.totals;
  const officialFinancial = status === DrawStatus.Settled ? official?.financial : undefined;

  const revenue = officialFinancial ? officialFinancial.totalRevenue : t.revenue;
  const commission = officialFinancial ? officialFinancial.totalAgentCommission : t.commission;

  return {
    totalRevenue: revenue,
    totalEntries: officialFinancial ? (official?.ticketEntryCount ?? t.entries) : t.entries,
    totalSets: t.sets,
    uniquePlayers,
    totalCommission: commission,
    netRevenue: revenue - commission,
  };
}

// ─── Play type distribution ──────────────────────────────────────────────────

/**
 * `byPlayType` (Record 12 key cố định) → PlayTypeRow[]. `pct` theo doanh thu (revenue).
 * Thứ tự lấy từ `PLAY_TYPE_CONFIGS` (rules) — nguồn duy nhất liệt kê 12 PlayType.
 */
export function toPlayTypeRows(stats: Stats): PlayTypeRow[] {
  const bp = stats.byPlayType;
  const rows: PlayTypeRow[] = (Object.keys(PLAY_TYPE_CONFIGS) as PlayType[]).map((pt) => {
    const s = bp[pt];
    return {
      playType: pt,
      label: MEGA645_PLAY_TYPE_LABELS[pt] ?? pt,
      sets: s.sets,
      boards: s.boards,
      revenue: s.amount,
      pct: 0,
    };
  });

  const totalRevenue = rows.reduce((a, r) => a + r.revenue, 0);
  for (const r of rows) {
    r.pct = totalRevenue > 0 ? (r.revenue / totalRevenue) * 100 : 0;
  }
  return rows;
}

// ─── Number frequency (heatmap 45 số) ────────────────────────────────────────

/**
 * `mega645_draw_number_stats` (≤45 doc) → NumberFreqItem[45] — điền "01".."45" đầy đủ
 * (số chưa có cược → sets/amount/boards = 0). Nguồn TÁCH RIÊNG collection (KHÁC Keno
 * nhúng trong stats doc) — xem JSDoc `Mega645DrawNumberStatsDoc`.
 */
export function toNumberFreq(numberStats: Mega645DrawNumberStatsEntity[]): NumberFreqItem[] {
  const byNum = new Map(numberStats.map((n) => [n.number, n]));
  return Array.from({ length: 45 }, (_, i) => {
    const num = String(i + 1).padStart(2, "0");
    const n = byNum.get(num);
    return {
      number: num,
      sets: n?.sets ?? 0,
      amount: n?.amount ?? 0,
      boards: n?.boards ?? 0,
    };
  });
}

// ─── Top combos ──────────────────────────────────────────────────────────────

/**
 * `snapshot.topCombos` → TopComboRow[] (rank 1-based). Nguồn là field CẤP SNAPSHOT
 * (derive lúc đọc từ `mega645_draw_combo_stats`, sort `sets desc` phía BE).
 */
export function toTopCombos(topCombos: Mega645TopCombo[]): TopComboRow[] {
  return topCombos.map((c, i) => ({
    rank: i + 1,
    numbers: c.numbers,
    playType: c.playType,
    sets: c.sets,
    accounts: c.accounts,
    amount: c.amount,
  }));
}

// ─── Tenant breakdown ────────────────────────────────────────────────────────

/**
 * `byTenant` (Record) → TenantRow[] sort revenue desc. `sets`/`players` = null
 * (stats không tách 2 field này theo tenant — TenantBreakdown ẩn/"—").
 */
export function toTenantRows(stats: Stats): TenantRow[] {
  const entries = Object.entries(stats.byTenant);
  const total = entries.reduce((a, [, v]) => a + v.amount, 0);
  return entries
    .map(([tenantId, v]) => ({
      tenantId,
      entries: v.entries,
      sets: null,
      players: null,
      revenue: v.amount,
      commission: v.commission,
      pct: total > 0 ? (v.amount / total) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

// ─── Exposure (fixed + jackpot, KHÔNG cap) ───────────────────────────────────

/**
 * Build ExposureView từ `snapshot.exposure` (Mega645SnapshotExposure) — field cấp
 * snapshot, KHÔNG phải `stats.exposure` (đó chỉ có `fixedWorstCase`, thiếu jackpot vì
 * jackpot đọc snapshot pool lúc build response — xem JSDoc {@link Mega645SnapshotExposure}).
 * KHÁC Power 6/55: `jackpotExposure` là 1 số duy nhất (không JP1/JP2).
 */
export function toExposureView(exposure: { fixedWorstCase: number; jackpotExposure: number }): ExposureView {
  return {
    fixedWorstCase: exposure.fixedWorstCase,
    jackpotExposure: exposure.jackpotExposure,
  };
}

// ─── Top risk ────────────────────────────────────────────────────────────────

/**
 * `snapshot.topAccounts` → TopAccountRow[]. Nguồn là field CẤP SNAPSHOT (derive từ
 * `mega645_draw_account_stats`), BE đã sort tiền desc.
 */
export function toTopAccounts(topAccounts: TopAccountStat[]): TopAccountRow[] {
  return topAccounts.map((a) => ({
    accountId: a.accountId,
    username: a.username,
    amount: a.amount,
    entries: a.entries,
  }));
}

/** `stats.topPotential` → TopPotentialRow[] (đã sort fixedPotential desc phía worker). */
export function toTopPotential(stats: Stats): TopPotentialRow[] {
  return stats.topPotential.map((p) => ({
    entryId: p.entryId,
    accountId: p.accountId,
    username: p.username,
    amount: p.amount,
    potentialWin: p.fixedPotential,
  }));
}
