/**
 * Keno – Shared Types
 *
 * Keno Vietlott:
 * - Tập số: 01-80
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

/** Số Keno: 1-80. */
export const KENO_NUMBER_MIN = 1;
export const KENO_NUMBER_MAX = 80;

/** Số lượng số quay mỗi kỳ. */
export const KENO_DRAW_COUNT = 20;

/** Số lượng số người chơi chọn: 1-10. */
export const KENO_PICK_MIN = 1;
export const KENO_PICK_MAX = 10;

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
 * Chọn 1-10 số từ 01-80, unique, sorted tăng dần.
 */
export interface NumberSelection {
  /** Danh sách số đã chọn (1-80), unique, sorted tăng dần. */
  numbers: number[];
}

/**
 * Lựa chọn cách chơi bổ sung Lớn/Nhỏ (Panel C).
 */
export interface BigSmallSelection {
  /**
   * Lựa chọn cược:
   * - "big": Lớn (≥13 số từ 41-80)
   * - "bigSmallDraw": Hoà Lớn Nhỏ (10+10)
   * - "small": Nhỏ (≥13 số từ 01-40)
   */
  bet: import("./enums").KenoBigSmallBet;
}

/**
 * Lựa chọn cách chơi bổ sung Chẵn/Lẻ (Panel C).
 */
export interface EvenOddSelection {
  /**
   * Lựa chọn cược:
   * - "even": Chẵn (≥15 số chẵn)
   * - "even1112": Chẵn 11-12 (11 hoặc 12 số chẵn)
   * - "evenOddDraw": Hoà (10 chẵn + 10 lẻ)
   * - "odd1112": Lẻ 11-12 (11 hoặc 12 số lẻ)
   * - "odd": Lẻ (≥15 số lẻ)
   */
  bet: import("./enums").KenoEvenOddBet;
}
