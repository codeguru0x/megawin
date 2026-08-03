/**
 * Keno Operations — Adapters
 *
 * Map slice của ops snapshot → UI type hiện có (KHÔNG đổi render contract của KpiStrip /
 * PlayTypeCard / NumberHeatmap / TenantBreakdown). Pure functions — gọi trong `useMemo` ở
 * section, dùng chung 1 nguồn.
 *
 * Từ p2-01 §3.5, một số adapter nhận **field cấp snapshot** thay vì `stats`:
 * `topCombos`/`topAccounts` không còn nằm trong stats doc (top-K theo metric tích luỹ bị
 * drift) — BE derive lúc đọc từ collection riêng và trả ở cấp snapshot.
 *
 * Quyết định honest-data (KHÔNG bịa số khi stats thiếu):
 * - Tenant `boards`/`players`: `byTenant` chỉ có {amount, entries, commission} →
 *   `null` (TenantBreakdown ẩn cột / render "—").
 */

import { DrawStatus } from "@megawin/game-core/entities";
import type {
  KenoDrawBettingStatsEntity,
  KenoTopCombo,
  TopAccountStat,
} from "@megawin/game-keno/entities";
import { KENO_ALL_NUMBERS, KENO_BASIC_PLAY_TYPES } from "@megawin/game-keno/entities";
import {
  KENO_BIG_SMALL_BET_LABELS,
  KENO_EVEN_ODD_BET_LABELS,
  KENO_PLAY_TYPE_LABELS,
} from "@megawin/game-keno/labels";

import type {
  ExposureView,
  NumberFreqItem,
  OpsKpi,
  PlayTypeRow,
  SideBetPair,
  TenantRow,
  TopAccountRow,
  TopComboRow,
  TopPotentialRow,
} from "./types";

type Stats = KenoDrawBettingStatsEntity;

// ─── KPI ─────────────────────────────────────────────────────────────────────

/** Số chính thức từ settle (`DrawDoc`) — slice tối thiểu adapter cần, KHÔNG kéo cả `GetDrawDetailOutput`. */
export interface OfficialFinancialSlice {
  /** `DrawDoc.financial` — undefined khi chưa settle / kỳ Void. */
  financial?: { totalRevenue: number; totalAgentCommission: number };
  /** `DrawDoc.stats.ticketEntryCount` — số entry chính thức (totalSettled, đã loại void). */
  ticketEntryCount?: number;
}

/**
 * KPI strip — hợp nhất 2 nguồn theo ma trận (analysis keno-stats-worker-simplification §5.3):
 * kỳ `Settled` ưu tiên số CHÍNH THỨC từ settle (`financial`/`stats` trên `DrawDoc`, aggregate
 * thẳng từ entries); live/Settling/Void dùng ops stats. `uniquePlayers` là số THẬT
 * (`countDocuments` trên `keno_draw_account_stats`, 1 doc/account) — luôn từ ops (settle không
 * có). `sets` cũng luôn từ ops — settle KHÔNG ghi số bộ cược (quyết định không mở rộng settle 7
 * game vì 1 ô dashboard).
 *
 * Guard: CHỈ override khi `status === Settled` VÀ `official.financial` tồn tại — `RESULT_SHOW`
 * gồm cả Published/Settling là lúc financial có thể CHƯA ghi; kỳ Void không bao giờ có
 * financial. Resettle ghi đè financial (idempotent overwrite) → vẫn đúng nguồn.
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
    // ticketEntryCount fallback t.entries khi doc settle cũ chưa ghi field — không hiện 0 sai.
    totalEntries: officialFinancial ? (official?.ticketEntryCount ?? t.entries) : t.entries,
    totalSets: t.sets,
    uniquePlayers,
    totalCommission: commission,
    netRevenue: revenue - commission,
  };
}

// ─── Play type distribution ──────────────────────────────────────────────────

/**
 * Gộp `byPlayType` thành PlayTypeRow[] — 10 pick + 2 side bet (gộp mọi hướng).
 *
 * Side bet trong stats tách hướng (bigSmall.big/small/draw, evenOdd.*); PlayTypeCard
 * hiển thị mức "bigSmall"/"evenOdd" tổng → cộng dồn các hướng lại. `pct` theo revenue.
 */
export function toPlayTypeRows(stats: Stats): PlayTypeRow[] {
  const bp = stats.byPlayType;

  // Thứ tự pick1→pick10 lấy từ core (KENO_BASIC_PLAY_TYPES) — KHÔNG khai lại mảng key ở UI.
  const picks: PlayTypeRow[] = KENO_BASIC_PLAY_TYPES.map((pt) => {
    const s = bp[pt];
    return {
      playType: pt,
      label: KENO_PLAY_TYPE_LABELS[pt] ?? pt,
      sets: s.sets,
      revenue: s.amount,
      pct: 0,
    };
  });

  // Side bet: cộng dồn mọi hướng thành 1 mức bigSmall / evenOdd.
  const bigSmallDirs = [bp.bigSmall.big, bp.bigSmall.small, bp.bigSmall.draw];
  const evenOddDirs = [
    bp.evenOdd.even,
    bp.evenOdd.even1112,
    bp.evenOdd.draw,
    bp.evenOdd.odd1112,
    bp.evenOdd.odd,
  ];
  const sum = (arr: { amount: number; sets: number }[], k: "amount" | "sets") =>
    arr.reduce((a, d) => a + d[k], 0);

  const sideBets: PlayTypeRow[] = [
    {
      playType: "bigSmall",
      label: KENO_PLAY_TYPE_LABELS.bigSmall,
      sets: sum(bigSmallDirs, "sets"),
      revenue: sum(bigSmallDirs, "amount"),
      pct: 0,
    },
    {
      playType: "evenOdd",
      label: KENO_PLAY_TYPE_LABELS.evenOdd,
      sets: sum(evenOddDirs, "sets"),
      revenue: sum(evenOddDirs, "amount"),
      pct: 0,
    },
  ];

  const rows = [...picks, ...sideBets];
  const totalRevenue = rows.reduce((a, r) => a + r.revenue, 0);
  for (const r of rows) {
    r.pct = totalRevenue > 0 ? (r.revenue / totalRevenue) * 100 : 0;
  }
  return rows;
}

// ─── Side-bet direction pairs ────────────────────────────────────────────────

/**
 * Cặp side bet đối xứng cho progress bar Lớn↔Nhỏ, Chẵn↔Lẻ.
 *
 * Chẵn/Lẻ gộp 2 mức mỗi hướng (even + even1112 vs odd + odd1112); hoà (draw) hiển
 * thị phụ, không tính vào lệch.
 */
export function toSideBetPairs(stats: Stats): SideBetPair[] {
  const bp = stats.byPlayType;
  return [
    {
      label: KENO_PLAY_TYPE_LABELS.bigSmall,
      left: { label: KENO_BIG_SMALL_BET_LABELS.big, amount: bp.bigSmall.big.amount },
      right: { label: KENO_BIG_SMALL_BET_LABELS.small, amount: bp.bigSmall.small.amount },
      drawAmount: bp.bigSmall.draw.amount,
    },
    {
      label: KENO_PLAY_TYPE_LABELS.evenOdd,
      left: {
        label: KENO_EVEN_ODD_BET_LABELS.even,
        amount: bp.evenOdd.even.amount + bp.evenOdd.even1112.amount,
      },
      right: {
        label: KENO_EVEN_ODD_BET_LABELS.odd,
        amount: bp.evenOdd.odd.amount + bp.evenOdd.odd1112.amount,
      },
      drawAmount: bp.evenOdd.draw.amount,
    },
  ];
}

// ─── Number frequency (heatmap 2 lớp) ────────────────────────────────────────

/**
 * `numberFreq` (Record "01".."80") → NumberFreqItem[] cho heatmap.
 * `sets` = số bộ cược basic chứa số này; kèm `amount` (dòng tiền) cho toggle 2 lớp.
 */
export function toNumberFreq(stats: Stats): NumberFreqItem[] {
  const nf = stats.numberFreq;
  // Iterate "01".."80" từ core (KENO_ALL_NUMBERS) — KHÔNG tự Array.from({length:80})+padStart.
  return KENO_ALL_NUMBERS.map((num) => {
    const s = nf[num];
    return {
      number: num,
      sets: s?.sets ?? 0,
      amount: s?.amount ?? 0,
    };
  });
}

// ─── Top combos ──────────────────────────────────────────────────────────────

/**
 * `snapshot.topCombos` → TopComboRow[] (rank 1-based; `sets` = số bộ, entryCount = accounts).
 *
 * Nguồn là **field cấp snapshot**, KHÔNG phải `stats.topCombos`: từ p2-01 §3.5 top-K theo
 * metric tích luỹ được derive lúc đọc từ `keno_draw_combo_stats` thay vì lưu mảng trong
 * stats doc (mảng đó drift). BE đã sort `sets` desc.
 */
export function toTopCombos(topCombos: KenoTopCombo[]): TopComboRow[] {
  return topCombos.map((c, i) => ({
    rank: i + 1,
    numbers: c.numbers,
    playType: c.playType,
    sets: c.sets,
    entryCount: c.accounts,
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

// ─── Exposure ────────────────────────────────────────────────────────────────

/**
 * Build ExposureView từ capSets (stats) + worstCaseTotal ĐÃ CAP + mẫu số maxSetsForFixed
 * từ config (thresholds). worstCaseTotal lấy từ `cappedExposure` của snapshot (KHÔNG
 * dùng `stats.exposure.worstCaseTotal` vì đó là RAW chưa cap — analysis §3.4). Mẫu số
 * `max` lấy từ config thực (thresholds.maxSetsForFixed), fallback default nếu thiếu.
 */
export function toExposureView(
  stats: Stats,
  cappedWorstCaseTotal: number,
  maxSetsForFixed: { pick8: number; pick9: number; pick10: number },
): ExposureView {
  const e = stats.exposure;
  return {
    worstCaseTotal: cappedWorstCaseTotal,
    capRows: [
      { playType: "pick8", sets: e.capSets.pick8, max: maxSetsForFixed.pick8 },
      { playType: "pick9", sets: e.capSets.pick9, max: maxSetsForFixed.pick9 },
      { playType: "pick10", sets: e.capSets.pick10, max: maxSetsForFixed.pick10 },
    ],
  };
}

// ─── Top risk ────────────────────────────────────────────────────────────────

/**
 * `snapshot.topAccounts` → TopAccountRow[].
 *
 * Nguồn là **field cấp snapshot** (derive từ `keno_draw_account_stats`), KHÔNG phải
 * `stats.topAccounts` — xem {@link toTopCombos}. BE đã sort tiền desc.
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
