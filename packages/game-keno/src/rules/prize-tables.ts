/**
 * Keno – Prize Tables (Bảng giải thưởng)
 *
 * Keno Vietlott – Cơ cấu giải thưởng cách chơi cơ bản:
 *
 * Bảng thưởng ứng với mệnh giá 10.000đ:
 *
 * Cột: "Bạn chơi bao nhiêu số" (pickCount)
 * Hàng: "Bạn trúng bao nhiêu số" (matchCount)
 *
 * ┌──────────┬───────────┬───────────┬───────────┬───────────┬───────────┬───────────┬───────────┬───────────┬───────────┬───────────┐
 * │ match\pick│    10    │     9    │     8    │     7    │     6    │     5    │     4    │     3    │     2    │     1    │
 * ├──────────┼───────────┼───────────┼───────────┼───────────┼───────────┼───────────┼───────────┼───────────┼───────────┼───────────┤
 * │    10    │ 2 Tỷ *   │          │          │          │          │          │          │          │          │          │
 * │     9    │ 150 tr   │ 800 tr * │          │          │          │          │          │          │          │          │
 * │     8    │ 8 tr     │ 12 tr    │ 200 tr * │          │          │          │          │          │          │          │
 * │     7    │ 710.000  │ 1,5 tr   │ 5 tr     │ 40 tr    │          │          │          │          │          │          │
 * │     6    │ 80.000   │ 150.000  │ 500.000  │ 1,2 tr   │ 12,5 tr  │          │          │          │          │          │
 * │     5    │ 20.000   │ 30.000   │ 50.000   │ 100.000  │ 450.000  │ 4,4 tr   │          │          │          │          │
 * │     4    │          │ 10.000   │ 10.000   │ 20.000   │ 40.000   │ 150.000  │ 400.000  │          │          │          │
 * │     3    │          │          │ 10.000   │ 10.000   │ 10.000   │ 10.000   │ 50.000   │ 200.000  │          │          │
 * │     2    │          │          │          │          │          │ 10.000   │ 20.000   │ 90.000   │          │          │
 * │     1    │          │          │          │          │          │          │          │          │          │ 20.000   │
 * │     0    │ 10.000   │ 10.000   │ 10.000   │          │          │          │          │          │          │          │
 * └──────────┴───────────┴───────────┴───────────┴───────────┴───────────┴───────────┴───────────┴───────────┴───────────┴───────────┘
 *
 * (*) Giải có giới hạn trả thưởng mỗi kỳ quay.
 */

import type { KenoPlayType } from "../entities/enums";

// ─────────────────────────────────────────────
// Basic Prize Table (cách chơi cơ bản)
// ─────────────────────────────────────────────

/**
 * Bảng giải thưởng cơ bản.
 * Key: pickCount (string "1"-"10"), Value: Map<matchCount (string), prize VND>
 *
 * Chỉ bao gồm các matchCount có giải (bỏ qua matchCount không có giải).
 *
 * LƯU Ý: Dùng string key vì MongoDB/JSON serialize object key luôn là string.
 * JS tự convert number literal → string key khi gán, nên { 6: 12_500_000 }
 * thực chất lưu key là "6". Type Record<string, ...> phản ánh đúng runtime.
 */
export const DEFAULT_BASIC_PRIZE_TABLE: Record<string, Record<string, number>> = {
  1: {
    1: 20_000,
  },
  2: {
    2: 90_000,
  },
  3: {
    3: 200_000,
    2: 20_000,
  },
  4: {
    4: 400_000,
    3: 50_000,
    2: 10_000,
  },
  5: {
    5: 4_400_000,
    4: 150_000,
    3: 10_000,
    2: 10_000,
  },
  6: {
    6: 12_500_000,
    5: 450_000,
    4: 40_000,
    3: 10_000,
  },
  7: {
    7: 40_000_000,
    6: 1_200_000,
    5: 100_000,
    4: 20_000,
    3: 10_000,
  },
  8: {
    8: 200_000_000,
    7: 5_000_000,
    6: 500_000,
    5: 50_000,
    4: 10_000,
    3: 10_000,
    0: 10_000,
  },
  9: {
    9: 800_000_000,
    8: 12_000_000,
    7: 1_500_000,
    6: 150_000,
    5: 30_000,
    4: 10_000,
    0: 10_000,
  },
  10: {
    10: 2_000_000_000,
    9: 150_000_000,
    8: 8_000_000,
    7: 710_000,
    6: 80_000,
    5: 20_000,
    0: 10_000,
  },
};

// ─────────────────────────────────────────────
// Side Bet Prize Tables (cách chơi bổ sung)
// ─────────────────────────────────────────────

/**
 * Bảng giải thưởng Lớn/Nhỏ (mệnh giá 10.000đ).
 *
 * Xác định kết quả dựa vào 20 số quay:
 * - bigCount = số lượng số 41-80 trong 20 số quay
 * - smallCount = số lượng số 1-40 trong 20 số quay
 *
 * Cược "Lớn":
 *   bigCount ≥ 13 → 26.000đ
 *   bigCount = 11 hoặc 12 → 10.000đ
 *
 * Cược "Hoà Lớn Nhỏ":
 *   bigCount = 10 (và smallCount = 10) → 26.000đ
 *
 * Cược "Nhỏ":
 *   smallCount ≥ 13 → 26.000đ
 *   smallCount = 11 hoặc 12 → 10.000đ
 */
export const DEFAULT_BIG_SMALL_PRIZES = {
  big13Plus: 26_000,
  big1112: 10_000,
  draw: 26_000,
  small1112: 10_000,
  small13Plus: 26_000,
} as const;

/**
 * Bảng giải thưởng Chẵn/Lẻ (mệnh giá 10.000đ).
 *
 * evenCount = số lượng số chẵn trong 20 số quay
 * oddCount = 20 - evenCount
 *
 * Cược "Chẵn":
 *   evenCount ≥ 15 → 200.000đ
 *   evenCount = 13 hoặc 14 → 40.000đ
 *
 * Cược "Chẵn 11-12":
 *   evenCount = 11 hoặc 12 → 20.000đ
 *
 * Cược "Hoà Chẵn Lẻ":
 *   evenCount = 10 (và oddCount = 10) → 20.000đ
 *
 * Cược "Lẻ 11-12":
 *   oddCount = 11 hoặc 12 → 20.000đ
 *
 * Cược "Lẻ":
 *   oddCount = 13 hoặc 14 → 40.000đ
 *   oddCount ≥ 15 → 200.000đ
 */
export const DEFAULT_EVEN_ODD_PRIZES = {
  even15Plus: 200_000,
  even1314: 40_000,
  even1112: 20_000,
  draw: 20_000,
  odd1112: 20_000,
  odd1314: 40_000,
  odd15Plus: 200_000,
} as const;

// ─────────────────────────────────────────────
// Lookup Functions
// ─────────────────────────────────────────────

/**
 * Tra cứu giải thưởng cách chơi cơ bản.
 *
 * @param pickCount - Số lượng số đã chọn (1-10)
 * @param matchCount - Số lượng số trùng
 * @param prizeTable - Bảng giải thưởng (default hoặc từ config)
 * @returns Giá trị giải thưởng (VND), 0 nếu không trúng
 */
export function lookupBasicPrize(
  pickCount: number,
  matchCount: number,
  prizeTable: Record<string, Record<string, number>> = DEFAULT_BASIC_PRIZE_TABLE,
): number {
  const tierPrizes = prizeTable[String(pickCount)];
  if (!tierPrizes) return 0;
  return tierPrizes[String(matchCount)] ?? 0;
}

/**
 * Lấy pickCount từ play type ("pick1"-"pick10").
 *
 * Dùng tại settle step khi cần tra cứu bảng giải thưởng nhưng chỉ có
 * `playType` string từ `EntryBoardPayout`, chưa có pickCount number.
 *
 * @param playType - KenoPlayType value (ví dụ "pick7")
 * @returns Số nguyên pickCount (1-10), hoặc `null` nếu là side bet (bigSmall/evenOdd)
 */
export function getPickCountFromPlayType(playType: KenoPlayType): number | null {
  const match = /^pick(\d+)$/.exec(playType);
  if (!match) return null;
  return parseInt(match[1]!, 10);
}
