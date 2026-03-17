/**
 * Bingo 18 – Shared Types
 *
 * Bingo 18 (Vietlott):
 * - Tập số: 1-6 (số nguyên)
 * - Quay 3 số mỗi kỳ (mỗi số rút ngẫu nhiên từ {1,2,3,4,5,6})
 * - Tổng 3 số: 3-18
 * - Cách chơi cơ bản: một số, hai số trùng, ba số trùng
 * - Cách chơi bổ sung: cộng tổng, Lớn/Hòa/Nhỏ
 */

import type { Bingo18BigSmallBet, Bingo18TripleKind } from "./enums";

// ─────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────

export type { ISODateString } from "@megawin/game-core/types";

// ─────────────────────────────────────────────
// Bingo 18 Number Ranges
// ─────────────────────────────────────────────

/** Mặt xúc xắc: 1-6. */
export const BINGO18_DICE_MIN = 1;
export const BINGO18_DICE_MAX = 6;

/** Số lượng số quay mỗi kỳ. */
export const BINGO18_DRAW_COUNT = 3;

/** Tổng tối thiểu / tối đa của 3 số quay. */
export const BINGO18_SUM_MIN = 3;
export const BINGO18_SUM_MAX = 18;

/** Ranh giới Lớn/Nhỏ: Nhỏ 3-9, Hòa 10-11, Lớn 12-18. */
export const BINGO18_SMALL_MAX = 9;
export const BINGO18_DRAW_VALUES = [10, 11] as const;
export const BINGO18_BIG_MIN = 12;

// ─────────────────────────────────────────────
// Valid Number Helpers
// ─────────────────────────────────────────────

/** Tất cả số Bingo 18 hợp lệ: 1, 2, 3, 4, 5, 6. */
export const BINGO18_VALID_NUMBERS: ReadonlySet<number> = new Set([1, 2, 3, 4, 5, 6]);

/** Tất cả tổng hợp lệ: 3-18. */
export const BINGO18_VALID_SUMS: ReadonlySet<number> = new Set(
  Array.from({ length: BINGO18_SUM_MAX - BINGO18_SUM_MIN + 1 }, (_, i) => i + BINGO18_SUM_MIN),
);

/** Tất cả cặp trùng nhau hợp lệ: 1-6. */
export const BINGO18_VALID_DOUBLES: ReadonlySet<number> = new Set([1, 2, 3, 4, 5, 6]);

// ─────────────────────────────────────────────
// Board Selection (user input)
// ─────────────────────────────────────────────

/**
 * Lựa chọn "Một số": chọn 1 số (1-6).
 * Thắng nếu số đó xuất hiện trong 3 số quay.
 * Trúng 1 lần = x1.2, trúng 2 lần = x2, trúng 3 lần = x3.
 */
export interface SingleNumSelection {
  number: number;
}

/**
 * Lựa chọn "Hai số trùng nhau": chọn 1 cặp (1-6).
 * Thắng nếu kết quả có ít nhất 2 số trùng với số đã chọn.
 */
export interface DoubleMatchSelection {
  number: number;
}

/**
 * Lựa chọn "Ba số trùng nhau": chọn cụ thể (1-6) hoặc "bất kỳ".
 * - Cụ thể: thắng nếu cả 3 số quay trùng với số đã chọn.
 * - Bất kỳ: thắng nếu cả 3 số quay giống nhau (bất kể số nào).
 */
export interface TripleMatchSelection {
  kind: Bingo18TripleKind;
  number?: number;
}

/**
 * Lựa chọn "Cộng tổng": chọn 1 tổng (3-18).
 * Thắng nếu tổng 3 số quay bằng tổng đã chọn.
 */
export interface SumTotalSelection {
  sum: number;
}

/**
 * Lựa chọn "Lớn/Hòa/Nhỏ".
 */
export interface BigSmallDrawSelection {
  bet: Bingo18BigSmallBet;
}

// ─────────────────────────────────────────────
// Prize Configuration Types
// ─────────────────────────────────────────────

/**
 * Bảng giải thưởng cách chơi "Một số".
 * Key: số lần xuất hiện (1, 2, 3) → giá trị thưởng.
 */
export interface SingleNumPrizes {
  match1: number;
  match2: number;
  match3: number;
}

/**
 * Bảng giải thưởng cách chơi "Hai số trùng nhau".
 * Trùng 2 = thắng.
 */
export interface DoubleMatchPrizes {
  win: number;
}

/**
 * Bảng giải thưởng cách chơi "Ba số trùng nhau".
 */
export interface TripleMatchPrizes {
  specific: number;
  any: number;
}

/**
 * Bảng giải thưởng cách chơi "Cộng tổng".
 * Key: tổng dưới dạng string (e.g. "3", "18") → giá trị thưởng (VND).
 * Dùng string vì MongoDB luôn serialize object key thành string.
 */
export type SumTotalPrizes = Record<string, number>;

/**
 * Bảng giải thưởng cách chơi "Lớn/Hòa/Nhỏ".
 */
export interface BigSmallDrawPrizes {
  big: number;
  draw: number;
  small: number;
}

/** Tỷ lệ tài chính – dùng trong GlobalConfigDoc.rates. */
export interface FinancialRates {
  defaultCommissionRate: number;
}

/** Quy tắc chơi – dùng trong GlobalConfigDoc.play. */
export interface PlayRules {
  /** Mệnh giá 1 lần tham gia (VND). Default: 10.000 */
  unitPrice: number;
  /** Số board cơ bản tối đa trên 1 vé. */
  maxBasicBoardsPerTicket: number;
  /** Số kỳ liên tiếp tối đa. */
  maxDrawCount: number;
  /** Đóng bán trước giờ quay bao nhiêu giây. */
  salesCloseBeforeSeconds: number;
  /** Khoảng cách giữa các kỳ quay (phút). Default: 6 */
  drawIntervalMinutes: number;
  /** Giờ bắt đầu quay trong ngày. Default: "06:00" */
  firstDrawTime: string;
  /** Giờ kết thúc quay trong ngày (kỳ cuối). Default: "21:53" */
  lastDrawTime: string;
  /** Timezone vận hành. Default: "Asia/Ho_Chi_Minh" */
  timezone: string;
}
