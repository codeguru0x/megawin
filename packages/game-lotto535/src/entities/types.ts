/**
 * Lotto 5/35 – Shared Types
 *
 * Các kiểu dữ liệu nhỏ dùng chung giữa entities.
 * Tách file riêng để tránh circular import.
 *
 * Quy ước chung cho mọi game:
 * - Số luôn lưu dạng number (không phải string "01").
 * - Hiển thị padStart ở UI layer.
 * - Tiền lưu dạng integer VND (không float).
 * - Ngày report dùng ISODateString "YYYY-MM-DD".
 * - Timestamp dùng Date.
 */

// ─────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────

export type { ISODateString } from "@megawin/game-core/types";

// ─────────────────────────────────────────────
// Draw Number (kỳ quay trong ngày)
// ─────────────────────────────────────────────

/**
 * Số thứ tự kỳ quay trong ngày cho Lotto 5/35.
 * Type-safe: chỉ chấp nhận 1 hoặc 2.
 */
export type DrawNo = typeof DrawNo.Morning | typeof DrawNo.Evening;

/**
 * Kỳ quay trong ngày.
 * - Morning (1): kỳ 13h
 * - Evening (2): kỳ 21h – kỳ chia giải Jackpot (split cycle) luôn là kỳ này.
 */
export const DrawNo = {
  /** Kỳ 13h (kỳ 1). */
  Morning: 1,
  /** Kỳ 21h (kỳ 2) – kỳ chia giải Jackpot. */
  Evening: 2,
} as const;

/** Mảng tất cả giá trị DrawNo – dùng cho validation. */
export const DRAW_NO_VALUES: readonly DrawNo[] = [DrawNo.Morning, DrawNo.Evening];

// ─────────────────────────────────────────────
// Lotto 5/35 Number Ranges
// ─────────────────────────────────────────────

/** Giá trị nhỏ nhất của số chính (1). */
export const LOTTO535_MAIN_MIN = 1;

/** Giá trị lớn nhất của số chính (35). */
export const LOTTO535_MAIN_MAX = 35;

/** Số lượng số chính cần chọn mỗi line (5 số). */
export const LOTTO535_MAIN_COUNT = 5;

/** Giá trị nhỏ nhất của số đặc biệt (1). */
export const LOTTO535_SPECIAL_MIN = 1;

/** Giá trị lớn nhất của số đặc biệt (12). */
export const LOTTO535_SPECIAL_MAX = 12;

// ─────────────────────────────────────────────
// Tuple & Value Types
// ─────────────────────────────────────────────

/**
 * Tuple 5 số chính – enforce đúng 5 phần tử tại compile time.
 * Luôn sorted tăng dần để canonicalize (dễ so sánh, hash).
 */
export type MainTuple = readonly [
  number,
  number,
  number,
  number,
  number,
];

/**
 * Số đặc biệt – 1 số từ 1 đến 12.
 * Alias cho rõ ý nghĩa domain, thực tế là number.
 */
export type Special = number;

// ─────────────────────────────────────────────
// Board Selection (user input)
// ─────────────────────────────────────────────

/**
 * Lựa chọn số của người chơi trên 1 board.
 * Số lượng phần tử tuỳ thuộc play type:
 * - standard:     mainNumbers.length = 5, specialNumbers.length = 1
 * - mainCover4:   mainNumbers.length = 4, specialNumbers.length = 1
 * - mainCover:    mainNumbers.length = 6..15, specialNumbers.length = 1
 * - specialCover: mainNumbers.length = 5, specialNumbers.length = 2..12
 * - quickPick:    empty (hệ thống tự sinh)
 */
export interface BoardSelection {
  /** Danh sách số chính (1-35), unique, khuyến nghị sorted tăng dần. */
  mainNumbers: number[];

  /** Danh sách số đặc biệt (1-12), unique, khuyến nghị sorted tăng dần. */
  specialNumbers: number[];
}

// ─────────────────────────────────────────────
// Line Value (expanded, canonical)
// ─────────────────────────────────────────────

/**
 * Một line con (bộ số con) sau khi expand từ board:
 * - main: đúng 5 số chính, sorted tăng dần
 * - special: đúng 1 số đặc biệt
 *
 * Đây là đơn vị nhỏ nhất để so sánh với kết quả quay.
 */
export interface LineValue {
  /** 5 số chính, sorted tăng dần (canonical form). */
  main: MainTuple;

  /** 1 số đặc biệt. */
  special: Special;
}

// ─────────────────────────────────────────────
// Prize Amounts (dùng chung Global & Tenant config)
// ─────────────────────────────────────────────

/**
 * Giá trị giải thưởng cố định (VND) cho mỗi tier.
 * Dùng chung bởi GlobalConfigDoc.defaultPrizes và TenantConfigDoc.prizeOverrides.
 */
export interface PrizeAmounts {
  /** Giải Nhất: 5 số chính. */
  tier1: number;
  /** Giải Nhì: 4 chính + đặc biệt. */
  tier2: number;
  /** Giải Ba: 4 chính. */
  tier3: number;
  /** Giải Tư: 3 chính + đặc biệt. */
  tier4: number;
  /** Giải Năm: 3 chính. */
  tier5: number;
  /** Giải Khuyến Khích: chỉ đặc biệt. */
  consolation: number;
}

// ─────────────────────────────────────────────
// Game Config Sub-types (tách ra để tránh indexed access)
// ─────────────────────────────────────────────

/** Cấu hình Jackpot – dùng trong GlobalConfigDoc.jackpot. */
export interface JackpotConfig {
  /** Số tiền khởi điểm khi mở kỳ Jackpot mới (VND). */
  seedAmount: number;
  /** Ngưỡng kích hoạt chia Jackpot (VND). */
  splitThreshold: number;
  /** Tỷ lệ chia Jackpot cho từng tier. */
  splitRatios: SplitRatios;
}

/** Tỷ lệ tài chính – dùng trong GlobalConfigDoc.rates. */
export interface FinancialRates {
  /** Hoa hồng đại lý mặc định (tỷ lệ trên doanh thu). */
  defaultCommissionRate: number;
  /** Tỷ lệ công ty thu về trên doanh thu. */
  companyRate: number;
}

/** Quy tắc chơi – dùng trong GlobalConfigDoc.play. */
export interface PlayRules {
  /** Giá 1 line (bộ số con) cho 1 kỳ (VND). */
  unitPrice: number;
  /** Số board tối đa trên 1 vé (A-E). */
  maxBoardsPerTicket: number;
  /** Số kỳ liên tiếp tối đa (KY). */
  maxDrawCount: number;
  /** Đóng bán trước giờ quay bao nhiêu phút. */
  salesCloseBeforeMinutes: number;
  /** Số kỳ quay mỗi ngày. */
  drawsPerDay: number;
  /** Giờ quay trong ngày (HH:mm). Timezone cố định: Asia/Ho_Chi_Minh. */
  drawTimes: string[];
}

// ─────────────────────────────────────────────
// Split Ratios
// ─────────────────────────────────────────────

/**
 * Tỷ lệ chia Jackpot cho các tier khi split cycle.
 * Tổng = 6 (tier1 = 2/6, tier2-5 mỗi tier = 1/6).
 * Key là PrizeTier string.
 */
export interface SplitRatios {
  /** Tỷ lệ phần chia cho Giải Nhất (mặc định 2/6 ≈ 33.3%). */
  tier1: number;
  /** Tỷ lệ phần chia cho Giải Nhì (mặc định 1/6 ≈ 16.7%). */
  tier2: number;
  /** Tỷ lệ phần chia cho Giải Ba (mặc định 1/6 ≈ 16.7%). */
  tier3: number;
  /** Tỷ lệ phần chia cho Giải Tư (mặc định 1/6 ≈ 16.7%). */
  tier4: number;
  /** Tỷ lệ phần chia cho Giải Năm (mặc định 1/6 ≈ 16.7%). */
  tier5: number;
}
