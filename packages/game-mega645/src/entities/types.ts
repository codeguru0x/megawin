/**
 * Mega 6/45 – Shared Types
 *
 * Mega 6/45: chọn 6 số từ 01-45, KHÔNG có số đặc biệt.
 * Giá vé: 10,000 VND / line.
 * Lịch quay: 3 lần/tuần – Thứ 4, Thứ 6, Chủ nhật lúc 18:00.
 */

// ─────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────

export type { ISODateString } from "@megawin/game-core/types";

// ─────────────────────────────────────────────
// Draw Number
// ─────────────────────────────────────────────

/**
 * Mega 6/45 chỉ quay 1 kỳ/ngày (18h).
 */
export type DrawNo = typeof DrawNo.Single;

export const DrawNo = {
  Single: 1,
} as const;

export const DRAW_NO_VALUES: readonly DrawNo[] = [DrawNo.Single];

// ─────────────────────────────────────────────
// Mega 6/45 Number Ranges
// ─────────────────────────────────────────────

/** Số chính: 1-45. */
export const MEGA645_MAIN_MIN = 1;
export const MEGA645_MAIN_MAX = 45;
/** Phải chọn đúng 6 số cho standard play. */
export const MEGA645_MAIN_COUNT = 6;

// ─────────────────────────────────────────────
// String Number Helpers
// ─────────────────────────────────────────────

/** Tất cả số chính hợp lệ dạng string zero-padded: "01"-"45". */
export const ALL_MAIN_NUMBERS: readonly string[] = Array.from(
  { length: MEGA645_MAIN_MAX - MEGA645_MAIN_MIN + 1 },
  (_, i) => String(i + MEGA645_MAIN_MIN).padStart(2, "0"),
);

/** Set tra nhanh O(1) cho số chính hợp lệ. */
export const VALID_MAIN_NUMBER_SET: ReadonlySet<string> = new Set(ALL_MAIN_NUMBERS);

// ─────────────────────────────────────────────
// Tuple & Value Types
// ─────────────────────────────────────────────

/**
 * Tuple 6 số chính dạng string zero-padded.
 * Khi lưu player selection: sorted tăng dần (canonical form).
 * Khi lưu draw result: giữ nguyên thứ tự quay (draw order).
 */
export type MainTuple = readonly [string, string, string, string, string, string];

// ─────────────────────────────────────────────
// Board Selection (user input)
// ─────────────────────────────────────────────

/**
 * Lựa chọn số của người chơi trên 1 board.
 *
 * Mega 6/45 KHÔNG có số đặc biệt, chỉ có mainNumbers.
 * - standard:  mainNumbers.length = 6
 * - bao5:      mainNumbers.length = 5
 * - bao7-18:   mainNumbers.length = 7..18
 * - quickPick: empty (hệ thống tự sinh)
 */
export interface BoardSelection {
  /**
   * Danh sách các số chính người chơi đã chọn ("01"-"45"), unique, sorted tăng dần.
   * - standard: 6 số (1 line)
   * - bao5: 5 số (hệ thống bổ sung số thứ 6 từ 40 số còn lại → 40 lines)
   * - bao7-18: 7..18 số (expand thành C(N,6) lines)
   * - quickPick: mảng rỗng (hệ thống tự sinh ngẫu nhiên 6 số)
   */
  mainNumbers: string[];
}

// ─────────────────────────────────────────────
// Line Value (expanded, canonical)
// ─────────────────────────────────────────────

/**
 * Một line con (bộ 6 số) sau khi expand từ board.
 * Đây là đơn vị nhỏ nhất để so sánh với kết quả quay.
 */
export interface LineValue {
  /** 6 số chính (tuple cố định 6 phần tử), sorted tăng dần. */
  main: MainTuple;
}

// ─────────────────────────────────────────────
// Prize Amounts
// ─────────────────────────────────────────────

/**
 * Giá trị giải thưởng cố định (VND) cho mỗi tier.
 * Mega 6/45 chỉ có 3 giải cố định (Jackpot là tích luỹ).
 */
export interface PrizeAmounts {
  /** Giải Nhất: 5/6 số. */
  tier1: number;
  /** Giải Nhì: 4/6 số. */
  tier2: number;
  /** Giải Ba: 3/6 số. */
  tier3: number;
}

// ─────────────────────────────────────────────
// Game Config Sub-types
// ─────────────────────────────────────────────

/**
 * Cấu hình Jackpot.
 * Mega 6/45 theo luật Vietlott: Jackpot chỉ tích luỹ (roll-over),
 * KHÔNG có cơ chế chia giải xuống hạng dưới.
 */
export interface JackpotConfig {
  /** Số tiền khởi điểm khi mở cycle Jackpot mới sau khi có winner (VND). Min 12 tỷ. */
  seedAmount: number;
}

/** Tỷ lệ tài chính. */
export interface FinancialRates {
  /** Tỷ lệ hoa hồng mặc định cho đại lý (tenant). Ví dụ: 0.2 = 20%. */
  defaultCommissionRate: number;
  /** Tỷ lệ thu nhập công ty trên tổng doanh thu. Ví dụ: 0.15 = 15%. */
  companyRate: number;
}

/**
 * Quy tắc chơi.
 * Mega 6/45 quay 3 lần/tuần: Thứ 4, Thứ 6, Chủ nhật.
 */
export interface PlayRules {
  /** Đơn giá 1 line (VND). Mặc định: 10,000 VND. */
  unitPrice: number;
  /** Số board tối đa trên 1 vé (tối đa 6 boards: A-F). */
  maxBoardsPerTicket: number;
  /** Số kỳ quay tối đa mà 1 vé có thể tham gia liên tiếp. */
  maxDrawCount: number;
  /** Số phút đóng bán trước giờ quay. Ví dụ: 5 = đóng bán 5 phút trước 18:00. */
  salesCloseBeforeMinutes: number;
  /** Số kỳ quay mỗi tuần (3: Wed, Fri, Sun). */
  drawsPerWeek: number;
  /** Các ngày quay trong tuần (0=Sun, 3=Wed, 5=Fri). */
  drawDaysOfWeek: number[];
  /** Giờ quay (HH:mm). */
  drawTime: string;
}

// ─────────────────────────────────────────────
// Board No
// ─────────────────────────────────────────────

export type BoardNo = "A" | "B" | "C" | "D" | "E" | "F";

/**
 * Mega 6/45 cho phép tối đa 6 boards (A-F) trên vé.
 */
export const VALID_BOARD_NOS: readonly BoardNo[] = ["A", "B", "C", "D", "E", "F"];

// ─────────────────────────────────────────────
// Bao Combinations lookup
// ─────────────────────────────────────────────

/**
 * Bảng tra cứu nhanh số line cho từng loại bao.
 * Bao 5 đặc biệt: chọn 5 số, số thứ 6 = 40 số còn lại → 40 lines.
 * Bao 7-18: C(N, 6).
 */
export const BAO_COMBINATIONS: Record<number, number> = {
  5: 40,
  7: 7,
  8: 28,
  9: 84,
  10: 210,
  11: 462,
  12: 924,
  13: 1716,
  14: 3003,
  15: 5005,
  18: 18564,
};
