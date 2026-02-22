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

/**
 * Ngày dạng ISO string "YYYY-MM-DD".
 * Dùng cho drawDate, report grouping – cho phép aggregation nhanh
 * hơn so với Date object.
 */
export type ISODateString = string;

// ─────────────────────────────────────────────
// Lotto 5/35 Number Ranges
// ─────────────────────────────────────────────

/** Số chính: 1-35. */
export const LOTTO535_MAIN_MIN = 1;
export const LOTTO535_MAIN_MAX = 35;
export const LOTTO535_MAIN_COUNT = 5;

/** Số đặc biệt: 1-12. */
export const LOTTO535_SPECIAL_MIN = 1;
export const LOTTO535_SPECIAL_MAX = 12;

// ─────────────────────────────────────────────
// Tuple & Value Types
// ─────────────────────────────────────────────

/**
 * Tuple 5 số chính – enforce đúng 5 phần tử tại compile time.
 * Luôn sorted tăng dần để canonicalize (dễ so sánh, hash).
 */
export type Lotto535MainTuple = readonly [
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
export type Lotto535Special = number;

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
export interface Lotto535BoardSelection {
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
export interface Lotto535LineValue {
  /** 5 số chính, sorted tăng dần (canonical form). */
  main: Lotto535MainTuple;

  /** 1 số đặc biệt. */
  special: Lotto535Special;
}

// ─────────────────────────────────────────────
// Split Ratios
// ─────────────────────────────────────────────

/**
 * Tỷ lệ chia Jackpot cho các tier khi split cycle.
 * Tổng = 6 (tier1 = 2/6, tier2-5 mỗi tier = 1/6).
 * Key là Lotto535PrizeTier string.
 */
export interface Lotto535SplitRatios {
  tier1: number;
  tier2: number;
  tier3: number;
  tier4: number;
  tier5: number;
}
