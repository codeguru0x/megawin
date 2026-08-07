/**
 * Shared UI types cho trang Vận hành Lotto 5/35.
 *
 * Lotto 5/35 khác Power 6/55:
 * - 2 không gian số: 35 số chính (01-35) + 12 số đặc biệt (01-12)
 * - 4 playType cơ bản nhưng 13 key thống kê (`Lotto535StatsPlayKey` — mainCover tách N=6..15)
 * - Jackpot ĐƠN (1 pool, không JP1/JP2) + Split Cycle (KHÔNG hiện ở UI vận hành — Q3)
 *
 * p0-03: `OpsKpi`/`PlayTypeRow`/`NumberFreqItem`/`TopComboRow`/`TopAccountRow`/
 * `TopPotentialRow`/`Exposure*` đọc từ snapshot vận hành (`GetOpsSnapshotOutput`) qua
 * `adapters.ts` — KHÔNG còn map từ 5 use-case cũ (summary/tenant-breakdown/number-frequency/
 * playtype-distribution/top-combos). `DrawResult`/`DrawFinancialDisplay`/`VoidInfo`/
 * `LiveFeedEntry` GIỮ NGUYÊN (result/draw-management/live-feed không đổi nguồn dữ liệu).
 */

import type { Lotto535StatsPlayKey, PrizeTier } from "@megawin/game-lotto535/entities";

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

// ─── Play Type Distribution (13 key thống kê) ────────────────────────────────

/** 1 dòng phân bổ theo `Lotto535StatsPlayKey` — khớp PlayTypeCard render contract. */
export interface PlayTypeRow {
  key: Lotto535StatsPlayKey;
  label: string;
  /** Tổng số bộ cược `Σ(board.expandedLines × betCount)` của key này. */
  sets: number;
  /** Số board (KHÔNG nhân betCount). */
  boards: number;
  /** Doanh thu (VND). */
  revenue: number;
  /** % theo doanh thu so với tổng. */
  pct: number;
}

// ─── Number Frequency (2 lưới: main 35 số + special 12 số) ──────────────────

/**
 * 1 số trên heatmap — chỉ dòng tiền (`amount`) + số bộ cược (`sets`) chứa số này.
 *
 * KHÔNG có per-number liability: worst-case là thuộc tính của LINE, gán cho từng
 * số sẽ double-count vô nghĩa. Rủi ro chi trả đo ở cấp entry — xem `TopPotentialRow`.
 */
export interface NumberFreqItem {
  /** Số, zero-padded "01".."35" (main) hoặc "01".."12" (special). */
  number: string;
  /** Số bộ cược chứa số này. */
  sets: number;
  /** Dòng tiền quy cho số (VND) — KHÔNG chia, cộng trọn tiền board chứa số. */
  amount: number;
  /** Số board (KHÔNG nhân betCount) chứa số này. */
  boards: number;
}

// ─── Tenant Breakdown ────────────────────────────────────────────────────────

/** 1 dòng phân tích theo đại lý — nguồn `stats.byTenant` (`DrawBettingStatsBase`). */
export interface TenantRow {
  tenantId: string;
  revenue: number;
  commission: number;
  entries: number;
  /** `byTenant` không tách riêng field số người chơi distinct — luôn `null`, UI render "—". */
  players: null;
  /** % theo doanh thu so với tổng mọi đại lý. */
  pct: number;
}

// ─── Top combos ──────────────────────────────────────────────────────────────

/** 1 bộ số phổ biến — khớp TopCombosCard render contract (`snapshot.topCombos`). */
export interface TopComboRow {
  rank: number;
  mainNumbers: string[];
  /** Số đặc biệt — rỗng cho standard/mainCover4/mainCover (luôn 1 số ĐB, không cần hiện riêng). */
  specialNumbers: string[];
  playType: string;
  /** Số bộ cược vào combo này. */
  sets: number;
  /** Số account distinct đã cược combo. */
  accounts: number;
  /** Tổng tiền vào combo (VND). */
  amount: number;
}

// ─── Settled Draw Result ─────────────────────────────────────────────────────

export interface DrawResult {
  /** 5 số chính (01-35). */
  winningMain: string[];
  winningSpecial: string;
  settledAt: string;
  tiers: {
    tier: PrizeTier;
    label: string;
    winnerCount: number;
    /** Tiền thưởng đơn vị / line (VND). */
    prizeAmount: number;
    totalPrize: number;
  }[];
  financial: DrawFinancialDisplay;
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
  /** Phần đóng góp Jackpot (VND). */
  jackpotContribution: number;
  /** Jackpot pool đầu kỳ (VND). */
  jackpotBefore: number;
  /**
   * Jackpot pool cuối kỳ (VND) = jackpotBefore + jackpotContribution.
   * Có winner: pool đã trao cho winner. Split: quỹ trước khi chia tier1-5. Roll-over: mang sang kỳ sau.
   */
  jackpotAfter: number;
  /** Kỳ này có người trúng độc đắc hay không. */
  hasJackpotWinner: boolean;
  /** Kỳ này là kỳ chia giải (split cycle) — JP chia cho tier1-5 thay vì trao độc đắc. */
  isSplitCycle: boolean;
  /**
   * Tổng pool Jackpot đã xử lý kỳ này (VND) = jackpotBefore + jackpotContribution.
   * Có winner: trao cho winner. Split: chia cho tier1-5. 0 nếu roll-over.
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
  /** Các số chính của board đầu tiên. */
  mainNumbers: string[];
  /** Các số đặc biệt (SpecialCover có nhiều, Standard có 1, MainCover không có). */
  specialNumbers: string[];
  /** Suffix mô tả kiểu bao, VD: "(Bao 8 số chính)". */
  suffix?: string;
  /** Tiền cược (VND). */
  amount: number;
  username: string;
  tenant: string;
}

// ─── Exposure (fixed worst-case + jackpot ĐƠN, KHÔNG cap) ────────────────────

/**
 * Slice exposure adapter → ExposureCard. KHÁC Power 6/55: Lotto 5/35 chỉ 1 pool
 * Jackpot (không JP1/JP2) — `fixedWorstCase` RAW không cap, `jackpotExposure` là
 * pool hiện hành (chặn bởi pool, KHÔNG nhân theo số vé). Split Cycle KHÔNG hiện ở
 * đây (không tạo liability mới trước giờ quay — Q3).
 */
export interface ExposureView {
  /** Worst-case giải cố định (VND) = `totals.sets × tier1`, RAW không cap. */
  fixedWorstCase: number;
  /** Jackpot pool hiện hành (VND) — closing (đã settle) hoặc current (active). */
  jackpotAmount: number;
  /** Tổng exposure jackpot (VND) — bằng `jackpotAmount` (chỉ 1 pool). */
  jackpotExposure: number;
}

/**
 * ExposureView + ngưỡng cảnh báo (VND) từ config — bọc để `select` slice snapshot 1 lần.
 * `warnAmount` = `thresholds.fixedExposureWarnAmount`.
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
  /** Tiền phải trả nếu entry trúng tối đa giải CỐ ĐỊNH (VND) — KHÔNG gồm jackpot/split share. */
  potentialWin: number;
}
