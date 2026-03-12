/**
 * Keno – Top Combos DTO
 *
 * "Bộ số phổ biến nhất" — nhóm basic boards theo bộ số và rank theo số lần chọn.
 * Keno: combo key = playType + sorted numbers (1-10 số, "01"-"80").
 * Side bets không có "combo" concept nên chỉ thống kê basic boards.
 */

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

/** Một combo (bộ số) phổ biến. */
export interface TopComboItem {
  /** Xếp hạng (1 = phổ biến nhất). */
  rank: number;
  /**
   * Kiểu chơi của combo (pick1-pick10).
   */
  playType: string;
  /**
   * Số được chọn — sorted tăng dần, zero-padded string ("01"-"80").
   * Số lượng tương ứng với pickCount (pick3 = 3 số, v.v.)
   */
  numbers: string[];
  /** Số boards chứa combo này (= số lần được chọn). */
  boardCount: number;
  /** Số entries distinct chứa combo này. */
  entryCount: number;
}

export interface GetTopCombosOutput {
  /** Mã kỳ quay. */
  drawId: string;
  /** Danh sách combo phổ biến nhất, sorted boardCount desc. */
  combos: TopComboItem[];
}
