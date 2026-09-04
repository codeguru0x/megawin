/**
 * Shared UI types cho trang Vận hành Mega 6/45.
 *
 * Mega 6/45 khác Power 6/55:
 * - Không có bonusNumber trong kết quả quay
 * - 4 hạng giải (jackpot, tier1, tier2, tier3) — Jackpot ĐƠN (không JP1+JP2)
 * - 45 số chính (01-45), 12 kiểu chơi (standard, bao5, bao7-bao18)
 * - Field số chọn tên `numbers` (không `mainNumbers`)
 *
 * p0-03: `OpsKpi`/`TenantRow`/`PlayTypeRow`/`NumberFreqItem`/`TopComboRow`/`TopAccountRow`/
 * `TopPotentialRow`/`Exposure*` đọc từ snapshot vận hành (`GetOpsSnapshotOutput`) qua
 * `adapters.ts` — KHÔNG còn map từ 5 use-case cũ (summary/tenant-breakdown/number-frequency/
 * playtype-distribution/top-combos). `DrawResult`/`DrawFinancialDisplay`/`VoidInfo`/
 * `LiveFeedEntry` GIỮ NGUYÊN (result/draw-management/live-feed không đổi nguồn dữ liệu).
 */

import type { PlayType, PrizeTier } from "@megawin/game-mega645/entities";

// ─── KPI ─────────────────────────────────────────────────────────────────────

export interface OpsKpi {
  /** Tổng doanh thu (VND). */
  totalRevenue: number;
  totalEntries: number;
  /** Tổng số bộ cược `Σ(board.expandedLines × betCount)` — khớp `DrawBettingTotals.sets`. */
  totalSets: number;
  /** Số người chơi distinct — `uniquePlayers` cấp snapshot (`countDocuments` account stats). */
  uniquePlayers: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalCommission: number;
  /** Doanh thu ròng sau hoa hồng (VND) = totalRevenue − totalCommission. */
  netRevenue: number;
}

// ─── Tenant Breakdown ────────────────────────────────────────────────────────

export interface TenantRow {
  tenantId: string;
  entries: number;
  /** Số bộ cược. `null` — `byTenant` (TenantBettingStat) không tách `sets` theo tenant. */
  sets: number | null;
  /** Số người chơi. `null` — `byTenant` không có players count theo tenant. */
  players: number | null;
  /** Doanh thu (VND). */
  revenue: number;
  /** Hoa hồng (VND). */
  commission: number;
  /** Phần trăm doanh thu so với tổng. */
  pct: number;
}

// ─── Play Type Distribution ──────────────────────────────────────────────────

/** 1 dòng phân bổ kiểu chơi — khớp PlayTypeCard render contract (12 kiểu Mega 6/45). */
export interface PlayTypeRow {
  playType: PlayType;
  label: string;
  /** Tổng số bộ cược `Σ(board.expandedLines × betCount)` của kiểu chơi này. */
  sets: number;
  /** Số board (KHÔNG nhân betCount) — phân biệt "1 vé to" (Bao 18) vs "nhiều vé nhỏ". */
  boards: number;
  /** Doanh thu (VND). */
  revenue: number;
  /** % theo doanh thu so với tổng. */
  pct: number;
}

// ─── Number Frequency ────────────────────────────────────────────────────────

/**
 * 1 số trên heatmap — chỉ dòng tiền (`amount`) + số bộ cược (`sets`) chứa số này.
 *
 * KHÔNG có per-number liability: worst-case là thuộc tính của LINE (trúng đủ 6 số),
 * gán cho từng số sẽ double-count vô nghĩa. Rủi ro chi trả đo ở cấp entry — xem
 * `TopPotentialRow` (mirror Power 6/55/Keno §3.7).
 */
export interface NumberFreqItem {
  /** Số chính, zero-padded "01".."45". */
  number: string;
  /** Số bộ cược `Σ(board.expandedLines × betCount)` chứa số này. */
  sets: number;
  /** Dòng tiền quy cho số (VND) — KHÔNG chia, cộng trọn tiền board chứa số. */
  amount: number;
  /** Số board (KHÔNG nhân betCount) chứa số này. */
  boards: number;
}

// ─── Top combos ──────────────────────────────────────────────────────────────

/** 1 bộ số phổ biến — khớp TopCombosCard render contract (`snapshot.topCombos`). */
export interface TopComboRow {
  rank: number;
  numbers: string[];
  playType: PlayType;
  /** Số bộ cược vào combo này (`Σ expandedLines × betCount` mọi account). */
  sets: number;
  /** Số account distinct đã cược combo. */
  accounts: number;
  /** Tổng tiền vào combo (VND). */
  amount: number;
}

// ─── Settled Draw Result ─────────────────────────────────────────────────────

export interface DrawResult {
  /** 6 số chính (01-45). */
  winningNumbers: [string, string, string, string, string, string];
  settledAt: string;
  tiers: {
    tier: PrizeTier;
    label: string;
    /** Số lines trúng thưởng. */
    winnerCount: number;
    /** Tiền thưởng đơn vị / line (VND). JP = chia theo pool. */
    prizeAmount: number;
    /** Tổng giải thưởng tier này (VND). */
    totalPrize: number;
  }[];
  /** Chỉ có sau settle; undefined khi Published chờ kết sổ / chờ kết sổ lại. */
  financial?: DrawFinancialDisplay;
}

export interface DrawFinancialDisplay {
  /** Tổng doanh thu (VND). */
  totalRevenue: number;
  /** Tổng giải thưởng cố định (VND). */
  totalFixedPrizes: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalAgentCommission: number;
  /**
   * Phần công ty giữ lại trên lý thuyết (VND) = round(totalRevenue × companyTakeRate).
   * Có thể lớn hơn số thực thu khi kỳ lỗ — dùng để hiển thị mức trần lý thuyết.
   */
  companyTake: number;
  /**
   * Phần công ty THỰC THU (VND) sau khi cap bởi số dư còn lại.
   * = min(companyTake, max(revenue − commission − fixedPrizes, 0)).
   * Đây là số tiền công ty thực sự nhận — dùng để tính Thu thuần.
   */
  actualCompanyTake: number;
  /** Phần đóng góp Jackpot (VND). */
  jackpotContribution: number;
  /** Jackpot pool đầu kỳ (VND). */
  jackpotBefore: number;
  /**
   * Jackpot pool cuối kỳ (VND) = jackpotBefore + jackpotContribution.
   * LƯU Ý: khi có winner, đây là pool ĐÃ TRAO cho winner (không phải quỹ còn lại);
   * quỹ thực tế cho kỳ sau reset về seed ở JackpotCycle.
   */
  jackpotAfter: number;
  /** Kỳ này có người trúng Jackpot hay không. */
  hasJackpotWinner: boolean;
  /**
   * Tổng tiền Jackpot đã trao cho winner kỳ này (VND).
   * = jackpotBefore + jackpotContribution khi có winner, 0 khi không.
   */
  jackpotPrizeAwarded: number;
}

// ─── Void Info ───────────────────────────────────────────────────────────────

export interface VoidInfo {
  reason: string;
  voidedBy: string;
  voidedAt: string;
  /** Tổng tiền hoàn trả (VND). */
  refundAmount: number;
  entryCount: number;
}

// ─── Live Feed (Recent Entries) ─────────────────────────────────────────────

export interface LiveFeedEntry {
  entryId: string;
  time: string;
  playType: string;
  playTypeLabel: string;
  /** Các số chính của board đầu tiên (01-45). */
  numbers: string[];
  /** Suffix mô tả kiểu bao, VD: "(bao 5)", "(bao 7)". */
  suffix?: string;
  /** Tiền cược (VND). */
  amount: number;
  username: string;
  tenant: string;
}

// ─── Exposure (fixed worst-case + jackpot, KHÔNG cap — analysis §3.6) ────────

/**
 * Slice exposure adapter → ExposureCard. KHÁC Power 6/55 (JP1+JP2): Mega 6/45 chỉ
 * có 1 Jackpot ĐƠN — `jackpotExposure` chính là pool hiện hành (đóng (đã settle)
 * hoặc current cycle (active)), KHÔNG cộng 2 pool.
 */
export interface ExposureView {
  /** Worst-case giải cố định (VND) = `totals.sets × tier1`, RAW không cap. */
  fixedWorstCase: number;
  /** Tổng exposure jackpot (VND) — closing (đã settle) hoặc current cycle (active). */
  jackpotExposure: number;
}

/**
 * ExposureView + ngưỡng cảnh báo (VND) từ config — bọc để `select` slice snapshot 1 lần.
 * `warnAmount` = `thresholds.fixedExposureWarnAmount` (analysis §4.3).
 */
export interface ExposureViewWithThreshold {
  view: ExposureView;
  /** Ngưỡng cảnh báo exposure giải cố định (VND tuyệt đối) từ config. */
  warnAmount: number;
}

// ─── Top risk (accounts theo tiền cược / theo liability) ─────────────────────

/** 1 account trong bảng "Top người chơi theo tiền cược" (`snapshot.topAccounts`). */
export interface TopAccountRow {
  /** ID account — link tới hồ sơ tài khoản. */
  accountId: string;
  /** Username hiển thị (ưu tiên trước accountId). Rỗng → UI fallback accountId. */
  username: string;
  /** Tổng tiền account cược trong kỳ (VND). */
  amount: number;
  /** Số entries account đặt trong kỳ. */
  entries: number;
}

/** 1 entry trong bảng "Top phải trả tiềm năng" (`stats.topPotential`). */
export interface TopPotentialRow {
  entryId: string;
  /** ID account — link tới hồ sơ tài khoản. */
  accountId: string;
  /** Username hiển thị (ưu tiên trước accountId). Rỗng → UI fallback accountId. */
  username: string;
  /** Tiền cược của entry (VND). */
  amount: number;
  /** Tiền phải trả nếu entry trúng tối đa giải CỐ ĐỊNH (VND) — KHÔNG gồm jackpot share. */
  potentialWin: number;
}
