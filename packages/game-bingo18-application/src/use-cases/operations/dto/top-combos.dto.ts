/**
 * Bingo 18 – Top Combos DTO
 *
 * "Bộ side bet phổ biến nhất" — thống kê sumTotal values + bigSmallDraw picks.
 * Khác Keno: Bingo 18 không có combo "bộ số" cho basic boards (3 xúc xắc 1-6).
 * Side bet combo có ý nghĩa hơn: tổng nào được đặt nhiều nhất, lớn/nhỏ/hòa nào phổ biến.
 */

import type { Bingo18PlayType, Bingo18BigSmallBet } from "@megawin/game-bingo18/entities";

// ─── Input ────────────────────────────────────────────────────────────────────

export interface GetTopCombosInput {
  /** Mã kỳ quay cần thống kê. */
  drawId: string;
  /**
   * Số combo trả về (top N).
   * Mặc định 10, tối đa 20.
   */
  limit?: number;
}

// ─── Output ───────────────────────────────────────────────────────────────────

/**
 * Một side bet combo phổ biến trong kỳ quay.
 * sumTotal: combo key = sum (tổng cụ thể 3-18).
 * bigSmallDraw: combo key = bet (big/draw/small).
 */
export interface TopComboItem {
  /** Xếp hạng (1 = phổ biến nhất). */
  rank: number;
  /** Loại side bet: sumTotal | bigSmallDraw. */
  playType: Bingo18PlayType;
  /**
   * Tổng đã chọn (3-18). Chỉ set cho sumTotal.
   */
  sum?: number;
  /**
   * Cược lớn/hòa/nhỏ. Chỉ set cho bigSmallDraw.
   */
  bet?: Bingo18BigSmallBet;
  /** Số lần side bet combo này được chọn trong kỳ. */
  count: number;
  /** Số entries distinct chứa side bet combo này. */
  entryCount: number;
}

export interface GetTopCombosOutput {
  /** Mã kỳ quay. */
  drawId: string;
  /** Danh sách side bet combo phổ biến nhất, sorted count desc. */
  combos: TopComboItem[];
}
