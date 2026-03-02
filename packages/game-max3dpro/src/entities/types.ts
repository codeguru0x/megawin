/**
 * Max 3D Pro – Shared Types
 *
 * Quy ước:
 * - Bộ ba số (triplet) lưu dạng string "000"-"999" (3 chữ số, zero-padded).
 * - Tiền lưu dạng integer VND (không float).
 * - Ngày report dùng ISODateString "YYYY-MM-DD".
 */

export type { ISODateString } from "@megawin/game-core/types";

// ─────────────────────────────────────────────
// Draw Number (kỳ quay trong tuần)
// ─────────────────────────────────────────────

/**
 * Max 3D Pro quay vào thứ 3, 5, 7 hàng tuần, 1 kỳ/ngày lúc 18h00.
 * DrawNo = 1 (chỉ có 1 kỳ/ngày).
 */
export type DrawNo = typeof DrawNo.Default;

export const DrawNo = {
  Default: 1,
} as const;

export const DRAW_NO_VALUES: readonly number[] = [DrawNo.Default];

// ─────────────────────────────────────────────
// Max 3D Pro Number Ranges
// ─────────────────────────────────────────────

/** Mỗi chữ số: 0-9. */
export const MAX3D_PRO_DIGIT_MIN = 0;
export const MAX3D_PRO_DIGIT_MAX = 9;

/** Bộ ba số: 000-999 (1000 giá trị). */
export const MAX3D_PRO_TRIPLET_MIN = 0;
export const MAX3D_PRO_TRIPLET_MAX = 999;
export const MAX3D_PRO_TRIPLET_TOTAL = 1000;

/** Số lượng bộ ba số quay mỗi kỳ. */
export const MAX3D_PRO_DRAW_COUNT_SPECIAL = 2;
export const MAX3D_PRO_DRAW_COUNT_FIRST = 4;
export const MAX3D_PRO_DRAW_COUNT_SECOND = 6;
export const MAX3D_PRO_DRAW_COUNT_THIRD = 8;
export const MAX3D_PRO_DRAW_TOTAL = 20;

/** Số lượng bộ ba số tối thiểu/tối đa cho multiNumber mode. */
export const MAX3D_PRO_MULTI_NUMBER_MIN = 3;
export const MAX3D_PRO_MULTI_NUMBER_MAX = 20;

// ─────────────────────────────────────────────
// Triplet & Value Types
// ─────────────────────────────────────────────

/**
 * Bộ ba số (000-999).
 * Lưu dạng string zero-padded 3 ký tự: "000", "001", ..., "999".
 */
export type Triplet = string;

/**
 * Một cặp hai bộ ba số (unit cơ bản của Max 3D Pro).
 * So khớp với kết quả quay thưởng.
 */
export interface TripletPair {
  first: Triplet;
  second: Triplet;
}

/**
 * Lựa chọn của người chơi trên 1 board.
 *
 * - multiNumber: triplets chứa 3-20 bộ ba số, hệ thống tạo C(n,2) cặp
 * - multiDigit: digits chứa 3 chữ số đầu + 3 chữ số sau, hệ thống expand
 */
export interface BoardSelection {
  triplets: Triplet[];
  /** Chỉ dùng cho multiDigit mode: 3 chữ số đầu. */
  frontDigits?: number[];
  /** Chỉ dùng cho multiDigit mode: 3 chữ số sau. */
  backDigits?: number[];
}

// ─────────────────────────────────────────────
// Prize Amounts
// ─────────────────────────────────────────────

/**
 * Giá trị giải thưởng cố định cho Max 3D Pro.
 * Áp dụng cho 1 lần tham gia dự thưởng mệnh giá 10.000 đồng.
 * Áp dụng cho vé gồm 2 bộ ba số KHÁC NHAU.
 * Nếu 2 bộ ba số GIỐNG NHAU → giải thưởng x2 (từ giải Nhất đến Sáu),
 * bằng tổng giá trị giải ĐB và phụ ĐB cho hạng ĐB/phụ ĐB.
 */
export interface PrizeAmounts {
  special: number;
  specialSub: number;
  first: number;
  second: number;
  third: number;
  fourth: number;
  fifth: number;
  sixth: number;
}

/**
 * Tổng hợp giải thưởng mặc định cho game Max 3D Pro.
 */
export interface Max3dproPrizeConfig {
  /** Giải thưởng cho vé 2 bộ ba số khác nhau. */
  standard: PrizeAmounts;
}

// ─────────────────────────────────────────────
// Game Config Sub-types
// ─────────────────────────────────────────────

/** Tỷ lệ tài chính. */
export interface FinancialRates {
  defaultCommissionRate: number;
  companyRate: number;
}

/** Quy tắc chơi. */
export interface PlayRules {
  unitPrice: number;
  maxBoardsPerTicket: number;
  maxDrawCount: number;
  salesCloseBeforeMinutes: number;
  drawsPerDay: number;
  drawTimes: string[];
  /** Các ngày trong tuần được phép quay (0=CN, 1=T2, ..., 6=T7). */
  drawDaysOfWeek: number[];
  /** Số lượng bộ ba số tối thiểu cho multiNumber mode. */
  multiNumberMin: number;
  /** Số lượng bộ ba số tối đa cho multiNumber mode. */
  multiNumberMax: number;
}
