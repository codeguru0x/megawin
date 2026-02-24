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
  Array.from({ length: KENO_NUMBER_MAX }, (_, i) =>
    String(i + 1).padStart(2, "0"),
  ),
);

/** Parse string number ("01"-"80") thành số nguyên. Trả null nếu invalid. */
export function parseKenoNumber(s: string): number | null {
  if (!KENO_VALID_NUMBERS.has(s)) return null;
  return parseInt(s, 10);
}

/** Format số nguyên thành string Keno ("01"-"80"). Trả null nếu out of range. */
export function formatKenoNumber(n: number): string | null {
  if (n < KENO_NUMBER_MIN || n > KENO_NUMBER_MAX || !Number.isInteger(n))
    return null;
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
  bet: import("./enums").KenoBigSmallBet;
}

/**
 * Lựa chọn cách chơi bổ sung Chẵn/Lẻ (Panel C).
 */
export interface EvenOddSelection {
  bet: import("./enums").KenoEvenOddBet;
}
