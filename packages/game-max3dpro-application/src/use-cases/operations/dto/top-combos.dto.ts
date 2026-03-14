/**
 * Max 3D Pro – Top Combos DTO
 *
 * "Cặp TripletPair phổ biến nhất" trong 1 kỳ quay.
 * Max 3D Pro chỉ có 1 loại combo: top cặp ordered pair (first, second) phổ biến.
 * Không có basic mode / combo3 / combo6 như Max 3D.
 */

// ─────────────────────────────────────────────
// GetTopCombos
// ─────────────────────────────────────────────

export interface GetTopCombosInput {
  /** Mã kỳ quay cần thống kê. */
  drawId: string;
  /**
   * Số combo trả về (top N).
   * Mặc định 10, tối đa 20.
   */
  limit?: number;
}

/** Top cặp TripletPair phổ biến (ordered: first + second). */
export interface TopPairComboItem {
  /** Xếp hạng (1 = phổ biến nhất). */
  rank: number;
  /** Bộ ba đầu tiên (zero-padded "000"-"999"). */
  first: string;
  /** Bộ ba thứ hai (zero-padded "000"-"999"). */
  second: string;
  /** Số boards chứa cặp này. */
  boardCount: number;
  /** Tổng tiền cược xấp xỉ (VND). */
  totalAmount: number;
}

export interface GetTopCombosOutput {
  /** Mã kỳ quay. */
  drawId: string;
  /** Top cặp TripletPair phổ biến nhất. */
  pairCombos: TopPairComboItem[];
}
