/**
 * Keno – Shared Types
 *
 * Keno Vietlott:
 * - Tập số: "01"-"80" (string 2 ký tự, zero-padded)
 * - Quay 20 số mỗi kỳ
 * - Người chơi chọn 1-10 số (cách chơi cơ bản)
 * - Hoặc đặt cược Lớn/Nhỏ, Chẵn/Lẻ (cách chơi bổ sung)
 */

// ─────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────

export type { ISODateString } from "@megawin/game-core/types";

// ─────────────────────────────────────────────
// Keno Number Ranges
// ─────────────────────────────────────────────

/** Số Keno: 1-80 (giá trị số học, dùng cho logic tính toán). */
export const KENO_NUMBER_MIN = 1;
export const KENO_NUMBER_MAX = 80;

/** Số lượng số quay mỗi kỳ. */
export const KENO_DRAW_COUNT = 20;

/** Số lượng số người chơi chọn: 1-10. */
export const KENO_PICK_MIN = 1;
export const KENO_PICK_MAX = 10;

// ─────────────────────────────────────────────
// String Number Helpers
// ─────────────────────────────────────────────

/**
 * Tất cả số Keno hợp lệ dưới dạng string: "01", "02", ..., "80".
 * Dùng cho validation và lookup.
 */
export const KENO_VALID_NUMBERS: ReadonlySet<string> = new Set(
  Array.from({ length: KENO_NUMBER_MAX }, (_, i) => String(i + 1).padStart(2, "0")),
);

/** Parse string number ("01"-"80") thành số nguyên. Trả null nếu invalid. */
export function parseKenoNumber(s: string): number | null {
  if (!KENO_VALID_NUMBERS.has(s)) return null;
  return parseInt(s, 10);
}

/** Format số nguyên thành string Keno ("01"-"80"). Trả null nếu out of range. */
export function formatKenoNumber(n: number): string | null {
  if (n < KENO_NUMBER_MIN || n > KENO_NUMBER_MAX || !Number.isInteger(n)) return null;
  return String(n).padStart(2, "0");
}

// ─────────────────────────────────────────────
// Big/Small boundary
// ─────────────────────────────────────────────

/**
 * Ngưỡng Lớn/Nhỏ:
 * - Số từ 1-40: "nhỏ"
 * - Số từ 41-80: "lớn"
 */
export const KENO_BIG_SMALL_BOUNDARY = 40;

import type { KenoBigSmallBet, KenoEvenOddBet } from "./enums";

// ─────────────────────────────────────────────
// Board Selection (user input)
// ─────────────────────────────────────────────

/**
 * Lựa chọn số của người chơi trên 1 board (cách chơi cơ bản).
 * Chọn 1-10 số dạng string "01"-"80", unique, sorted tăng dần.
 */
export interface NumberSelection {
  /** Danh sách số đã chọn dạng string ("01"-"80"), unique, sorted tăng dần. */
  numbers: string[];
}

/**
 * Lựa chọn cách chơi bổ sung Lớn/Nhỏ (Panel C).
 */
export interface BigSmallSelection {
  bet: KenoBigSmallBet;
}

/**
 * Lựa chọn cách chơi bổ sung Chẵn/Lẻ (Panel C).
 */
export interface EvenOddSelection {
  bet: KenoEvenOddBet;
}

// ─────────────────────────────────────────────
// Prize Configuration Types (dùng chung Global & Tenant config)
// ─────────────────────────────────────────────

/**
 * Bảng giải thưởng cách chơi cơ bản.
 * Key: "pick{N}" (N = 1-10)
 * Value: map từ số trùng (matchCount dạng string) → giá trị thưởng (VND).
 *
 * LƯU Ý: MongoDB và JSON serialize object key luôn là STRING.
 * Key matchCount lưu dạng "0", "1", ..., "10" (string), KHÔNG phải number.
 *
 * Dùng chung bởi GlobalConfigDoc.basicPrizes và TenantConfigDoc.prizeOverrides.basicPrizes.
 */
export type BasicPrizes = Record<string, Record<string, number>>;

/**
 * Bảng giải thưởng cách chơi bổ sung Lớn/Nhỏ.
 */
export interface BigSmallPrizes {
  /** Lớn: ≥13 số từ 41-80 → 26.000đ */
  big13Plus: number;
  /** Lớn: 11 hoặc 12 số từ 41-80 → 10.000đ */
  big1112: number;
  /** Hoà Lớn Nhỏ: 10 số mỗi bên → 26.000đ */
  draw: number;
  /** Nhỏ: 11 hoặc 12 số từ 01-40 → 10.000đ */
  small1112: number;
  /** Nhỏ: ≥13 số từ 01-40 → 26.000đ */
  small13Plus: number;
}

/**
 * Bảng giải thưởng cách chơi bổ sung Chẵn/Lẻ.
 */
export interface EvenOddPrizes {
  /** Chẵn: ≥15 số chẵn → 200.000đ */
  even15Plus: number;
  /** Chẵn: 13 hoặc 14 số chẵn → 40.000đ */
  even1314: number;
  /** Chẵn 11-12: 11 hoặc 12 số chẵn → 20.000đ */
  even1112: number;
  /** Hoà: 10 chẵn + 10 lẻ → 20.000đ */
  draw: number;
  /** Lẻ 11-12: 11 hoặc 12 số lẻ → 20.000đ */
  odd1112: number;
  /** Lẻ: 13 hoặc 14 số lẻ → 40.000đ */
  odd1314: number;
  /** Lẻ: ≥15 số lẻ → 200.000đ */
  odd15Plus: number;
}

/**
 * Giới hạn trả thưởng mỗi kỳ quay cho bậc cao.
 */
export interface PayoutCaps {
  /** Bậc 8 trùng 8: ≤50 bộ → 200tr/bộ, >50 bộ → 10 tỷ chia đều. */
  pick8MaxPerDraw: number;
  pick8MaxSetsForFixed: number;

  /** Bậc 9 trùng 9: ≤12 bộ → 800tr/bộ, >12 bộ → 10 tỷ chia đều. */
  pick9MaxPerDraw: number;
  pick9MaxSetsForFixed: number;

  /** Bậc 10 trùng 10: ≤5 bộ → 2 tỷ/bộ, >5 bộ → 10 tỷ chia đều. */
  pick10MaxPerDraw: number;
  pick10MaxSetsForFixed: number;
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
  /** Mệnh giá 1 lần tham gia (VND). Default: 10.000 */
  unitPrice: number;
  /** Số panel cơ bản tối đa trên 1 vé. Default: 2 (A, B) */
  maxBasicBoardsPerTicket: number;
  /** Số kỳ liên tiếp tối đa. Default: 20 */
  maxDrawCount: number;
  /** Đóng bán trước giờ quay bao nhiêu giây. Default: 60 */
  salesCloseBeforeSeconds: number;
  /** Khoảng cách giữa các kỳ quay (phút). Default: 10 */
  drawIntervalMinutes: number;
  /** Giờ bắt đầu quay trong ngày. Default: "06:00" */
  firstDrawTime: string;
  /** Giờ kết thúc quay trong ngày (kỳ cuối). Default: "21:55" */
  lastDrawTime: string;
  /** Timezone vận hành. Default: "Asia/Ho_Chi_Minh" */
  timezone: string;
}

/**
 * Override giải thưởng cho tenant.
 * Dùng chung bởi GlobalConfigDoc (default values) và TenantConfigDoc (override).
 */
export interface KenoPrizeOverrides {
  basicPrizes?: BasicPrizes;
  bigSmallPrizes?: BigSmallPrizes;
  evenOddPrizes?: EvenOddPrizes;
}
