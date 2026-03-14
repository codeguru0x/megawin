/**
 * Power 6/55 – Prize Tier Determination
 *
 * Luật trúng thưởng Power 6/55 (theo thể lệ chính thức):
 *
 * | Giải       | Kết quả                              |
 * |------------|--------------------------------------|
 * | Jackpot 1  | Trùng 6 số kết quả quay số mở thưởng |
 * | Jackpot 2  | Trùng 5 số kết quả quay số + số đặc biệt |
 * | Giải Nhất  | Trùng 5 số kết quả quay số           |
 * | Giải Nhì   | Trùng 4 số kết quả quay số           |
 * | Giải Ba    | Trùng 3 số kết quả quay số           |
 *
 * Ghi chú quan trọng:
 * - "Số đặc biệt" (bonus) được quay từ 49 quả bóng còn lại sau khi đã chọn 6.
 * - Bonus number KHÁC với 6 số winning chính.
 * - Bonus match = bonus number nằm trong 6 số player chọn.
 * - Trúng nhiều hạng → chỉ lĩnh hạng cao nhất.
 * - Trùng 6/6 = Jackpot 1 (bonus không liên quan đến JP1).
 * - Trùng 5/6 + bonus = Jackpot 2 (KHÔNG phải Giải Nhất).
 * - Trùng 5/6 (no bonus) = Giải Nhất.
 */

import { PrizeTier } from "../entities/enums";

export interface LineMatchResult {
  /** Hạng giải trúng (null = không trúng). Chỉ trả về hạng cao nhất. */
  tier: PrizeTier | null;
  /** Số lượng số chính trùng với kết quả quay (0-6). */
  mainMatchCount: number;
  /** Bonus number có nằm trong 6 số player chọn không. Chỉ ảnh hưởng phân biệt JP2 vs Giải Nhất khi mainMatchCount = 5. */
  bonusMatched: boolean;
}

/**
 * Xác định hạng giải cao nhất cho 1 line.
 *
 * @param mainMatchCount - Số lượng số chính trùng (0-6)
 * @param bonusMatched - Bonus number có nằm trong dãy số player chọn không
 * @returns PrizeTier hoặc null nếu không trúng
 */
export function determineTier(mainMatchCount: number, bonusMatched: boolean): PrizeTier | null {
  switch (mainMatchCount) {
    case 6:
      return PrizeTier.Jackpot1;
    case 5:
      return bonusMatched ? PrizeTier.Jackpot2 : PrizeTier.Tier1;
    case 4:
      return PrizeTier.Tier2;
    case 3:
      return PrizeTier.Tier3;
    default:
      return null;
  }
}

/**
 * Xác định TẤT CẢ các giải trúng cho 1 line.
 *
 * Theo thể lệ: trùng nhiều hạng → chỉ lĩnh hạng cao nhất.
 *
 * Lưu ý quan trọng — 1 LINE chỉ trúng 1 giải:
 *   - 6/6 → JP1 (bonus KHÔNG BAO GIỜ match vì bonus ∉ winning set)
 *   - 5/6 + bonus → JP2 (KHÔNG phải Giải Nhất)
 *   - 5/6 (no bonus) → Giải Nhất
 *
 * Tuy nhiên, 1 ENTRY (Bao) CÓ THỂ trúng cả JP1 VÀ JP2 qua các lines khác nhau.
 * Ví dụ Bao 7: chọn 7 số gồm 6 winning + bonus → 7 lines:
 *   - 1 line 6/6 → JP1
 *   - 6 lines 5/6 + bonus → JP2
 *
 * Ví dụ Bao 5: chọn 5 số, HT ghép 50 số còn lại → 50 lines:
 *   - Nếu 5 số đã chọn chứa 5/6 winning và số ghép vào = số winning thứ 6 → 6/6 JP1
 *
 * → Function này trả về mảng 1 phần tử (hoặc rỗng) cho MỖI LINE.
 *   Caller (settle-entries) tổng hợp tier counts qua nhiều lines để xác định
 *   entry có trúng JP1 + JP2 đồng thời hay không.
 */
export function determineTiers(mainMatchCount: number, bonusMatched: boolean): PrizeTier[] {
  const tier = determineTier(mainMatchCount, bonusMatched);
  return tier ? [tier] : [];
}

/**
 * Thứ tự ưu tiên hạng giải từ cao đến thấp.
 * Dùng để tìm hạng cao nhất trong danh sách tiers trúng.
 */
const TIER_PRIORITY: PrizeTier[] = [
  PrizeTier.Jackpot1,
  PrizeTier.Jackpot2,
  PrizeTier.Tier1,
  PrizeTier.Tier2,
  PrizeTier.Tier3,
];

export function highestTier(tiers: PrizeTier[]): PrizeTier | null {
  for (const t of TIER_PRIORITY) {
    if (tiers.includes(t)) return t;
  }
  return null;
}
