/**
 * Power 6/55 – Top Combos DTO
 *
 * "Bộ số phổ biến nhất" — nhóm boards theo combo key và rank theo số lần chọn.
 * Power 6/55: combo key = playType + sorted mainNumbers (01-55).
 */

export interface GetTopCombosInput {
  drawId: string;
  /**
   * Số combo trả về (top N).
   * Mặc định 10, tối đa 20.
   */
  limit?: number;
}

export interface TopComboItem {
  rank: number;
  playType: string;
  /** Số chính — sorted tăng dần, zero-padded string (01-55). */
  mainNumbers: string[];
  entryCount: number;
  totalAmount: number;
}

export interface GetTopCombosOutput {
  drawId: string;
  combos: TopComboItem[];
}
