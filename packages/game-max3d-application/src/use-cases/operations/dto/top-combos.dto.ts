/**
 * Max 3D – Top Combos DTO
 *
 * "Bộ ba phổ biến nhất" trong 1 kỳ quay.
 * Max 3D có 2 loại combo:
 *   1. Top bộ ba đơn (basic): triplet phổ biến nhất
 *   2. Top cặp bộ ba (plus): cặp (triplet1, triplet2) phổ biến nhất trong plus mode
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

/** Top bộ ba đơn phổ biến (basic mode). */
export interface TopSingleComboItem {
  /** Xếp hạng (1 = phổ biến nhất). */
  rank: number;
  /** Bộ ba số (zero-padded "000"-"999"). */
  triplet: string;
  /** Số boards chứa bộ ba này. */
  boardCount: number;
  /** Tổng tiền cược xấp xỉ (VND). */
  totalAmount: number;
}

/** Top cặp bộ ba phổ biến (plus mode). */
export interface TopPlusComboItem {
  /** Xếp hạng (1 = phổ biến nhất). */
  rank: number;
  /** Bộ ba đầu tiên (zero-padded). */
  triplet1: string;
  /** Bộ ba thứ hai (zero-padded). */
  triplet2: string;
  /** Số boards plus chứa cặp này. */
  boardCount: number;
  /** Tổng tiền cược xấp xỉ (VND). */
  totalAmount: number;
}

export interface GetTopCombosOutput {
  /** Mã kỳ quay. */
  drawId: string;
  /** Top bộ ba đơn phổ biến nhất (basic mode). */
  singleCombos: TopSingleComboItem[];
  /** Top cặp bộ ba phổ biến nhất (plus mode). */
  plusCombos: TopPlusComboItem[];
}
