/**
 * Max 3D Pro – Draw Result
 *
 * Kết quả quay thưởng 1 kỳ: 20 bộ ba số, chia theo hạng giải.
 * Cấu trúc giống Max 3D: special(2), first(4), second(6), third(8).
 */

import type { Triplet } from "./types";

/**
 * Kết quả quay thưởng Max 3D Pro.
 * Tổng cộng 20 bộ ba số mỗi kỳ.
 */
export interface Max3dproDrawResult {
  /** 2 bộ ba số giải Đặc Biệt. */
  special: Triplet[];
  /** 4 bộ ba số giải Nhất. */
  first: Triplet[];
  /** 6 bộ ba số giải Nhì. */
  second: Triplet[];
  /** 8 bộ ba số giải Ba. */
  third: Triplet[];
}
