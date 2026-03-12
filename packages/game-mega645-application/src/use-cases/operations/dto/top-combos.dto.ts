/**
 * Mega 6/45 – Top Combos DTO
 *
 * "Bộ số phổ biến nhất" — nhóm entries theo combo (bộ số chính)
 * và rank theo số lần chọn giảm dần.
 *
 * Mega 6/45: combo key = playType + sorted mainNumbers (không có specialNumbers).
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

/** Một combo (bộ số) phổ biến — Mega 6/45 không có specialNumbers. */
export interface TopComboItem {
  /** Xếp hạng (1 = phổ biến nhất). */
  rank: number;
  /**
   * Kiểu chơi của combo.
   * Lấy từ playType của board đầu tiên trong nhóm.
   */
  playType: string;
  /** Số chính của combo — sorted tăng dần, zero-padded string (01-45). */
  mainNumbers: string[];
  /** Số entries chứa combo này (= số lần được chọn). */
  entryCount: number;
  /** Tổng tiền cược xấp xỉ — entry.amount × tỷ lệ lines board / tổng lines entry. */
  totalAmount: number;
}

export interface GetTopCombosOutput {
  /** Mã kỳ quay. */
  drawId: string;
  /** Danh sách combo phổ biến nhất, sorted entryCount desc. */
  combos: TopComboItem[];
}
