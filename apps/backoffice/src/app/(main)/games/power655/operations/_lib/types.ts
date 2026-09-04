/**
 * Shared UI types cho trang Vận hành Power 6/55.
 *
 * Power 6/55 khác Mega 6/45:
 * - Có bonusNumber trong kết quả quay
 * - 5 hạng giải (jackpot1, jackpot2, tier1-3)
 * - Jackpot kép: JP1 (6/6) + JP2 (5/6 + bonus)
 * - 55 số chính (01-55), 12 kiểu chơi (standard, bao5, bao7-bao18)
 *
 * p0-03: `OpsKpi`/`TenantRow`/`PlayTypeRow`/`NumberFreqItem`/`TopComboRow`/`TopAccountRow`/
 * `TopPotentialRow`/`Exposure*` đọc từ snapshot vận hành (`GetOpsSnapshotOutput`) qua
 * `adapters.ts` — KHÔNG còn map từ 5 use-case cũ (summary/tenant-breakdown/number-frequency/
 * playtype-distribution/top-combos). `DrawResult`/`DrawFinancialDisplay`/`VoidInfo`/
 * `LiveFeedEntry` GIỮ NGUYÊN (result/draw-management/live-feed không đổi nguồn dữ liệu).
 */

import type { PlayType, PrizeTier } from "@megawin/game-power655/entities";

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

/** 1 dòng phân bổ kiểu chơi — khớp PlayTypeCard render contract (12 kiểu Power 6/55). */
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
 * `TopPotentialRow` (mirror Keno §3.7).
 */
export interface NumberFreqItem {
  /** Số chính, zero-padded "01".."55". */
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
  mainNumbers: string[];
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
  /** 6 số chính (01-55). */
  winningMain: string[];
  /** Số thưởng (bonus number). */
  bonusNumber: string;
  settledAt: string;
  tiers: {
    tier: PrizeTier;
    label: string;
    winnerCount: number;
    /** Tiền thưởng đơn vị / line (VND). JP = chia theo pool. */
    prizeAmount: number;
    totalPrize: number;
  }[];
  /** Chỉ có sau settle; undefined khi Published chờ kết sổ / chờ kết sổ lại. */
  financial?: DrawFinancialDisplay;
}

export interface DrawFinancialDisplay {
  totalRevenue: number;
  totalFixedPrizes: number;
  totalAgentCommission: number;
  /** Công ty thu lý thuyết (VND) = round(revenue × companyRate). Mức trần trước cap. */
  companyTake: number;
  /**
   * Công ty THỰC THU (VND) sau cap bởi số dư.
   * = min(companyTake, max(revenue − commission − fixedPrizes, 0)). Dùng để tính Thu thuần.
   */
  actualCompanyTake: number;
  /** Đóng góp vào JP1 (VND). Đã trừ jp1Overflow nếu overflow kích hoạt. */
  jackpot1Contribution: number;
  /** Đóng góp vào JP2 (VND). Đã cộng jp1Overflow nếu overflow kích hoạt + có JP2 winner. */
  jackpot2Contribution: number;
  /**
   * Phần JP1 vượt ngưỡng chuyển sang JP2 (VND).
   * > 0 chỉ khi: JP1 > threshold + không có JP1 winner + có JP2 winner.
   */
  jp1Overflow: number;
  jackpot1Before: number;
  jackpot1After: number;
  jackpot2Before: number;
  jackpot2After: number;
  /** Kỳ này có người trúng JP1 (6/6) hay không. */
  hasJackpot1Winner: boolean;
  /** Kỳ này có người trúng JP2 (5/6 + bonus) hay không. */
  hasJackpot2Winner: boolean;
  /** Tổng pool JP1 đã trao cho winner (VND) = opening + contribution. 0 nếu không có winner. */
  jackpot1PrizeAwarded: number;
  /** Tổng pool JP2 đã trao cho winner (VND) = opening + contribution. 0 nếu không có winner. */
  jackpot2PrizeAwarded: number;
}

// ─── Void Info ───────────────────────────────────────────────────────────────

export interface VoidInfo {
  reason: string;
  voidedBy: string;
  voidedAt: string;
  refundAmount: number;
  entryCount: number;
}

// ─── Live Feed (Recent Entries) ─────────────────────────────────────────────

export interface LiveFeedEntry {
  entryId: string;
  time: string;
  playType: string;
  playTypeLabel: string;
  /** Các số chính của board đầu tiên (01-55). */
  mainNumbers: string[];
  /** Suffix mô tả kiểu bao, VD: "(Bao 7)", "(Bao 15)". */
  suffix?: string;
  amount: number;
  username: string;
  tenant: string;
}

// ─── Exposure (fixed worst-case + jackpot, KHÔNG cap — analysis §3.6) ────────

/**
 * Slice exposure adapter → ExposureCard. KHÁC Keno CĂN BẢN: Power 6/55 không có
 * bảng maxPrize/cap — `fixedWorstCase` là số VND tuyệt đối (RAW), `jackpotExposure`
 * là JP1+JP2 hiện hành (chặn bởi pool, KHÔNG nhân theo số vé).
 */
export interface ExposureView {
  /** Worst-case giải cố định (VND) = `totals.sets × tier1`, RAW không cap. */
  fixedWorstCase: number;
  /** JP1 dùng để tính jackpotExposure (VND) — closing (đã settle) hoặc current (active). */
  jackpot1: number;
  /** JP2 dùng để tính jackpotExposure (VND) — closing (đã settle) hoặc current (active). */
  jackpot2: number;
  /** Tổng exposure jackpot (VND) = jackpot1 + jackpot2. */
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
