/**
 * Bingo 18 – Prize Tables (Bảng giải thưởng)
 *
 * Bingo 18 Vietlott – Cơ cấu giải thưởng:
 *
 * Mệnh giá 10.000đ / lần tham gia dự thưởng.
 * Kết quả mở thưởng: quay 3 số từ {1,2,3,4,5,6}.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ 1. Cách chơi Một số (singleNum)                               │
 * ├──────────┬────────────────────────────────────┬────────────────┤
 * │ Chọn số  │ Kết quả                            │ Giải thưởng   │
 * ├──────────┼────────────────────────────────────┼────────────────┤
 * │ Số N     │ Quay có 1 số N                     │ 12.000đ       │
 * │ Số N     │ Quay có 2 số N                     │ 20.000đ       │
 * │ Số N     │ Quay có 3 số N                     │ 30.000đ       │
 * └──────────┴────────────────────────────────────┴────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ 2. Cách chơi Hai số trùng nhau (doubleMatch)                  │
 * ├──────────────┬────────────────────────────────┬────────────────┤
 * │ Chọn cặp    │ Kết quả                         │ Giải thưởng   │
 * ├──────────────┼────────────────────────────────┼────────────────┤
 * │ Hai số N     │ Quay có ít nhất 2 số N          │ 75.000đ       │
 * └──────────────┴────────────────────────────────┴────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ 3. Cách chơi Ba số trùng nhau (tripleMatch)                   │
 * ├──────────────┬────────────────────────────────┬────────────────┤
 * │ Chọn bộ 3   │ Kết quả                         │ Giải thưởng   │
 * ├──────────────┼────────────────────────────────┼────────────────┤
 * │ Ba số N      │ Quay có 3 số N                  │ 1.200.000đ    │
 * │ Ba số bất kỳ │ Quay có 3 số trùng nhau bất kỳ │ 200.000đ      │
 * └──────────────┴────────────────────────────────┴────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ 4. Cách chơi Cộng tổng (sumTotal)                             │
 * ├──────┬────────────────────────┬────────────────────────────────┤
 * │ Tổng │ Xác định kết quả      │ Giải thưởng                    │
 * ├──────┼────────────────────────┼────────────────────────────────┤
 * │  3   │ Tổng 3 số quay = 3    │ 1.200.000đ                     │
 * │  4   │ Tổng 3 số quay = 4    │ 400.000đ                       │
 * │  5   │ Tổng 3 số quay = 5    │ 200.000đ                       │
 * │  6   │ Tổng 3 số quay = 6    │ 120.000đ                       │
 * │  7   │ Tổng 3 số quay = 7    │ 80.000đ                        │
 * │  8   │ Tổng 3 số quay = 8    │ 55.000đ                        │
 * │  9   │ Tổng 3 số quay = 9    │ 47.000đ                        │
 * │ 10   │ Tổng 3 số quay = 10   │ 44.000đ                        │
 * │ 11   │ Tổng 3 số quay = 11   │ 44.000đ                        │
 * │ 12   │ Tổng 3 số quay = 12   │ 47.000đ                        │
 * │ 13   │ Tổng 3 số quay = 13   │ 55.000đ                        │
 * │ 14   │ Tổng 3 số quay = 14   │ 80.000đ                        │
 * │ 15   │ Tổng 3 số quay = 15   │ 120.000đ                       │
 * │ 16   │ Tổng 3 số quay = 16   │ 200.000đ                       │
 * │ 17   │ Tổng 3 số quay = 17   │ 400.000đ                       │
 * │ 18   │ Tổng 3 số quay = 18   │ 1.200.000đ                     │
 * └──────┴────────────────────────┴────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ 5. Cách chơi Lớn/Hòa/Nhỏ (bigSmallDraw)                      │
 * ├──────────┬────────────────────────────────┬────────────────────┤
 * │ Cách chơi│ Xác định kết quả              │ Giải thưởng        │
 * ├──────────┼────────────────────────────────┼────────────────────┤
 * │ Nhỏ      │ Tổng 3 số quay từ 3 đến 9     │ 15.000đ            │
 * │ Hòa      │ Tổng 3 số quay là 10 hoặc 11  │ 20.000đ            │
 * │ Lớn      │ Tổng 3 số quay từ 12 đến 18   │ 15.000đ            │
 * └──────────┴────────────────────────────────┴────────────────────┘
 */

import type { Bingo18PlayType } from "../entities/enums";
import type {
  SingleNumPrizes,
  DoubleMatchPrizes,
  TripleMatchPrizes,
  SumTotalPrizes,
  BigSmallDrawPrizes,
} from "../entities/types";

// ─────────────────────────────────────────────
// Default Prize Tables
// ─────────────────────────────────────────────

export const DEFAULT_SINGLE_NUM_PRIZES: SingleNumPrizes = {
  match1: 12_000,
  match2: 20_000,
  match3: 30_000,
};

export const DEFAULT_DOUBLE_MATCH_PRIZES: DoubleMatchPrizes = {
  win: 75_000,
};

export const DEFAULT_TRIPLE_MATCH_PRIZES: TripleMatchPrizes = {
  specific: 1_200_000,
  any: 200_000,
};

export const DEFAULT_SUM_TOTAL_PRIZES: SumTotalPrizes = {
  3: 1_200_000,
  4: 400_000,
  5: 200_000,
  6: 120_000,
  7: 80_000,
  8: 55_000,
  9: 47_000,
  10: 44_000,
  11: 44_000,
  12: 47_000,
  13: 55_000,
  14: 80_000,
  15: 120_000,
  16: 200_000,
  17: 400_000,
  18: 1_200_000,
};

export const DEFAULT_BIG_SMALL_DRAW_PRIZES: BigSmallDrawPrizes = {
  big: 15_000,
  draw: 20_000,
  small: 15_000,
};

// ─────────────────────────────────────────────
// Lookup Functions
// ─────────────────────────────────────────────

/**
 * Tra cứu giải thưởng "Một số" theo số lần xuất hiện.
 */
export function lookupSingleNumPrize(
  matchCount: number,
  prizes: SingleNumPrizes = DEFAULT_SINGLE_NUM_PRIZES,
): number {
  switch (matchCount) {
    case 1:
      return prizes.match1;
    case 2:
      return prizes.match2;
    case 3:
      return prizes.match3;
    default:
      return 0;
  }
}

/**
 * Tra cứu giải thưởng "Cộng tổng" theo tổng.
 */
export function lookupSumTotalPrize(
  sum: number,
  prizes: SumTotalPrizes = DEFAULT_SUM_TOTAL_PRIZES,
): number {
  return prizes[sum] ?? 0;
}

/**
 * Xác định loại cách chơi từ PlayType có phải basic hay side bet.
 */
export function isBasicPlayType(playType: Bingo18PlayType): boolean {
  return (
    playType === "singleNum" ||
    playType === "doubleMatch" ||
    playType === "tripleMatch"
  );
}
