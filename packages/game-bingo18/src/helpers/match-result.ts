/**
 * Bingo 18 – Match Result Helpers
 *
 * 5 hàm pure để so sánh lựa chọn người chơi với 3 số kết quả quay.
 * Mỗi hàm nhận bảng giải thưởng (prizes) từ GlobalConfig — KHÔNG hardcode giá trị.
 *
 * Thứ tự gọi trong settle pipeline:
 *   boards  → matchSingleNum / matchDoubleMatch / matchTripleMatch
 *   sideBets → matchSumTotal / matchBigSmallDraw
 */

import { Bingo18BigSmallBet, Bingo18TripleKind } from "../entities/enums";
import { BINGO18_SMALL_MAX, BINGO18_DRAW_VALUES, BINGO18_BIG_MIN } from "../entities/types";
import {
  DEFAULT_SINGLE_NUM_PRIZES,
  DEFAULT_DOUBLE_MATCH_PRIZES,
  DEFAULT_TRIPLE_MATCH_PRIZES,
  DEFAULT_SUM_TOTAL_PRIZES,
  DEFAULT_BIG_SMALL_DRAW_PRIZES,
} from "../rules/prize-tables";
import type {
  SingleNumPrizes,
  DoubleMatchPrizes,
  TripleMatchPrizes,
  SumTotalPrizes,
  BigSmallDrawPrizes,
} from "../entities/types";

// ─────────────────────────────────────────────
// Shared Input Type
// ─────────────────────────────────────────────

/**
 * Kết quả kỳ quay — input cho tất cả 5 hàm match.
 * Tách riêng khỏi DrawDoc để dùng được trong test mà không cần full entity.
 */
export interface DrawResultForMatch {
  /** 3 số kết quả quay (thứ tự quay, có thể trùng nhau). */
  numbers: number[];
  /**
   * Tổng 3 số = numbers[0] + numbers[1] + numbers[2].
   * Dải hợp lệ: 3 (1+1+1) → 18 (6+6+6).
   * Pre-computed trong draw document — tránh tính lại nhiều lần trong settle.
   */
  sum: number;
}

// ─────────────────────────────────────────────
// 1. Single Number — "Một số"
// ─────────────────────────────────────────────

/**
 * Kết quả match cách chơi "Một số".
 *
 * matchCount: số lần số đã chọn xuất hiện trong kết quả (0-3).
 * winAmount: 0 nếu thua; > 0 nếu thắng (tra bảng theo matchCount).
 */
export interface SingleNumMatchResult {
  /** Số lần số đã chọn xuất hiện trong 3 số quay (0, 1, 2, 3). */
  matchCount: number;
  /** Tiền thắng (VND). 0 nếu matchCount = 0. */
  winAmount: number;
}

/**
 * Match cách chơi "Một số": đếm số lần số đã chọn xuất hiện → tra bảng giải.
 *
 * Luật: chỉ lĩnh 1 bậc giải duy nhất tương ứng số lần xuất hiện.
 * - 0 lần → thua (winAmount = 0)
 * - 1 lần → match1 prize (mặc định 12.000đ, ×1.2)
 * - 2 lần → match2 prize (mặc định 20.000đ, ×2)
 * - 3 lần → match3 prize (mặc định 30.000đ, ×3)
 *
 * @param selectedNumber - Số người chơi đã chọn (1-6)
 * @param result - Kết quả kỳ quay
 * @param prizes - Bảng giải từ GlobalConfig (default: giá trị tham khảo)
 */
export function matchSingleNum(
  selectedNumber: number,
  result: DrawResultForMatch,
  prizes: SingleNumPrizes = DEFAULT_SINGLE_NUM_PRIZES,
): SingleNumMatchResult {
  // Đếm số lần selectedNumber xuất hiện trong 3 viên xúc xắc.
  // Xúc xắc độc lập → cùng 1 số có thể xuất hiện 1, 2, hoặc 3 lần.
  const matchCount = result.numbers.filter((n) => n === selectedNumber).length;

  // Tra bảng giải theo số lần xuất hiện.
  // matchCount = 0: không xuất hiện → thua, không cần tra bảng.
  let winAmount = 0;
  switch (matchCount) {
    case 1:
      winAmount = prizes.match1;
      break;
    case 2:
      winAmount = prizes.match2;
      break;
    case 3:
      winAmount = prizes.match3;
      break;
    // case 0: winAmount giữ nguyên 0 — không cần default
  }

  return { matchCount, winAmount };
}

// ─────────────────────────────────────────────
// 2. Double Match — "Hai số trùng nhau"
// ─────────────────────────────────────────────

/**
 * Kết quả match cách chơi "Hai số trùng nhau".
 *
 * isWin: true nếu số đã chọn xuất hiện ≥ 2 lần.
 * matchCount: số lần xuất hiện thực tế (0-3) — lưu để aggregation settleSummary.
 */
export interface DoubleMatchResult {
  /** Số lần số đã chọn xuất hiện (0-3). */
  matchCount: number;
  /** true nếu matchCount >= 2. */
  isWin: boolean;
  /** Tiền thắng (VND). 0 nếu thua. */
  winAmount: number;
}

/**
 * Match cách chơi "Hai số trùng nhau": thắng khi số đã chọn xuất hiện ≥ 2 lần.
 *
 * Luật: chỉ 1 mức giải duy nhất (không phân biệt ≥2 hay =3 lần).
 * - 0-1 lần → thua
 * - ≥ 2 lần → thắng win prize (mặc định 75.000đ, ×7.5)
 *
 * @param selectedNumber - Số người chơi đã chọn (1-6)
 * @param result - Kết quả kỳ quay
 * @param prizes - Bảng giải từ GlobalConfig
 */
export function matchDoubleMatch(
  selectedNumber: number,
  result: DrawResultForMatch,
  prizes: DoubleMatchPrizes = DEFAULT_DOUBLE_MATCH_PRIZES,
): DoubleMatchResult {
  // Đếm số lần xuất hiện — cùng logic với singleNum nhưng ngưỡng thắng là ≥2.
  const matchCount = result.numbers.filter((n) => n === selectedNumber).length;
  // Thắng khi xuất hiện ít nhất 2 lần (cả 2 lần hoặc 3 lần đều nhận cùng 1 giải).
  const isWin = matchCount >= 2;
  return { matchCount, isWin, winAmount: isWin ? prizes.win : 0 };
}

// ─────────────────────────────────────────────
// 3. Triple Match — "Ba số trùng nhau"
// ─────────────────────────────────────────────

/**
 * Kết quả match cách chơi "Ba số trùng nhau".
 *
 * Bingo 18 có 2 loại tripleMatch với mức giải khác nhau:
 * - specific (chọn đúng số): 1.200.000đ — xác suất 1/216 (0,46%)
 * - any (bất kỳ 3 giống): 200.000đ — xác suất 6/216 (2,78%)
 */
export interface TripleMatchResult {
  /** true nếu cả 3 số quay trùng nhau (và trùng số đã chọn nếu kind = specific). */
  isWin: boolean;
  /** Tiền thắng (VND). 0 nếu thua. */
  winAmount: number;
}

/**
 * Match cách chơi "Ba số trùng nhau": kiểm tra allSame theo kind.
 *
 * Hai loại (Bingo18TripleKind):
 * - `specific`: cả 3 số quay = selectedNumber (xác suất 1/216, giải 1.200.000đ)
 * - `any`: cả 3 số quay giống nhau — bất kể số nào (xác suất 6/216, giải 200.000đ)
 *
 * @param kind - Loại triple: specific hoặc any
 * @param selectedNumber - Số cụ thể đã chọn (chỉ cần với kind = specific)
 * @param result - Kết quả kỳ quay
 * @param prizes - Bảng giải từ GlobalConfig
 */
export function matchTripleMatch(
  kind: Bingo18TripleKind,
  selectedNumber: number | undefined,
  result: DrawResultForMatch,
  prizes: TripleMatchPrizes = DEFAULT_TRIPLE_MATCH_PRIZES,
): TripleMatchResult {
  const [a, b, c] = result.numbers;
  // Điều kiện cần cho cả 2 loại: cả 3 viên xúc xắc phải cho cùng 1 số.
  const allSame = a === b && b === c;

  switch (kind) {
    case Bingo18TripleKind.Specific: {
      // specific: cả 3 số = số đã chọn. Giải cao hơn (1.200.000đ) vì khó hơn.
      // allSame đảm bảo a === b === c, chỉ cần check thêm a === selectedNumber.
      const isWin = allSame && a === selectedNumber;
      return { isWin, winAmount: isWin ? prizes.specific : 0 };
    }
    case Bingo18TripleKind.Any: {
      // any: cả 3 số giống nhau — không cần biết là số nào.
      // Xác suất 6/216 vì có 6 combo (111, 222, 333, 444, 555, 666).
      return { isWin: allSame, winAmount: allSame ? prizes.any : 0 };
    }
    default: {
      const _: never = kind;
      throw new Error(`Unknown tripleKind: ${_}`);
    }
  }
}

// ─────────────────────────────────────────────
// 4. Sum Total — "Cộng tổng"
// ─────────────────────────────────────────────

/**
 * Kết quả match cách chơi "Cộng tổng".
 *
 * outcome: chuỗi mô tả tổng thực tế (e.g. "sum9") — lưu vào sideBetPayout để audit.
 * Giải thưởng đối xứng quanh 10.5: tổng 3 và 18 cùng giải cao nhất (1.200.000đ).
 */
export interface SumTotalMatchResult {
  /**
   * Tổng thực tế dưới dạng string, e.g. "sum9".
   * Lưu vào sideBetPayout.outcome để hiển thị kết quả cho player.
   */
  outcome: string;
  /** true nếu tổng quay = tổng đã chọn. */
  isWin: boolean;
  /** Tiền thắng (VND). Tra SumTotalPrizes theo selectedSum. 0 nếu thua. */
  winAmount: number;
}

/**
 * Match cách chơi "Cộng tổng": thắng khi tổng 3 số quay = tổng đã chọn chính xác.
 *
 * Giải thưởng tra theo key = String(selectedSum) vì SumTotalPrizes dùng string key (MongoDB convention).
 * Giải đối xứng: 3=18, 4=17, 5=16, ... → cùng 1 giải khi khoảng cách đến 10.5 bằng nhau.
 *
 * @param selectedSum - Tổng người chơi đã chọn (3-18)
 * @param result - Kết quả kỳ quay (chỉ dùng result.sum)
 * @param prizes - Bảng giải từ GlobalConfig
 */
export function matchSumTotal(
  selectedSum: number,
  result: DrawResultForMatch,
  prizes: SumTotalPrizes = DEFAULT_SUM_TOTAL_PRIZES,
): SumTotalMatchResult {
  // So khớp chính xác — không có "gần đúng" trong sumTotal.
  const isWin = result.sum === selectedSum;
  return {
    // outcome ghi lại tổng thực tế kỳ quay để player biết kết quả là gì.
    outcome: `sum${result.sum}`,
    isWin,
    // Tra string key vì SumTotalPrizes dùng string key; ?? 0 phòng key thiếu trong bảng.
    // Chỉ tra bảng giải khi thắng; ?? 0 phòng trường hợp selectedSum không có trong bảng.
    winAmount: isWin ? (prizes[String(selectedSum)] ?? 0) : 0,
  };
}

// ─────────────────────────────────────────────
// 5. Big/Small/Draw — "Lớn/Hòa/Nhỏ"
// ─────────────────────────────────────────────

/**
 * Kết quả match cách chơi "Lớn/Hòa/Nhỏ".
 *
 * outcome: mô tả loại cược + tổng thực tế (e.g. "small_sum8", "draw_sum10") — để audit.
 */
export interface BigSmallDrawMatchResult {
  /**
   * Mô tả kết quả, e.g. "small_sum8", "draw_sum10", "big_sum15".
   * Format: "{loại_cược}_sum{tổng_thực_tế}" — lưu vào sideBetPayout.outcome.
   */
  outcome: string;
  /** true nếu cược khớp kết quả quay. */
  isWin: boolean;
  /** Tiền thắng (VND). 0 nếu thua. */
  winAmount: number;
}

/**
 * Match cách chơi "Lớn/Hòa/Nhỏ": so sánh tổng 3 số quay với ngưỡng đã định.
 *
 * Phân loại tổng (3-18):
 * - Nhỏ (`small`): tổng 3-9  (106/216 = 49,07%) → giải 15.000đ (×1.5)
 * - Hòa  (`draw`): tổng 10-11 (54/216 = 25,00%) → giải 20.000đ (×2)
 * - Lớn  (`big`):  tổng 12-18 (56/216 = 25,93%) → giải 15.000đ (×1.5)
 *
 * LƯU Ý: big + small không có xác suất 50/50 — small chiếm 49,07% vì
 * không gian [3-9] có nhiều tổ hợp hơn [12-18] (106 vs 56 ways/216).
 *
 * @param bet - Loại cược: small | draw | big
 * @param result - Kết quả kỳ quay (chỉ dùng result.sum)
 * @param prizes - Bảng giải từ GlobalConfig
 */
export function matchBigSmallDraw(
  bet: Bingo18BigSmallBet,
  result: DrawResultForMatch,
  prizes: BigSmallDrawPrizes = DEFAULT_BIG_SMALL_DRAW_PRIZES,
): BigSmallDrawMatchResult {
  const { sum } = result;

  switch (bet) {
    case Bingo18BigSmallBet.Small: {
      // Nhỏ: tổng 3-9. BINGO18_SMALL_MAX = 9.
      const isWin = sum <= BINGO18_SMALL_MAX;
      return { outcome: `small_sum${sum}`, isWin, winAmount: isWin ? prizes.small : 0 };
    }

    case Bingo18BigSmallBet.Draw: {
      // Hòa: tổng 10 hoặc 11. BINGO18_DRAW_VALUES = [10, 11].
      const isWin = (BINGO18_DRAW_VALUES as ReadonlyArray<number>).includes(sum);
      return { outcome: `draw_sum${sum}`, isWin, winAmount: isWin ? prizes.draw : 0 };
    }

    case Bingo18BigSmallBet.Big: {
      // Lớn: tổng 12-18. BINGO18_BIG_MIN = 12.
      const isWin = sum >= BINGO18_BIG_MIN;
      return { outcome: `big_sum${sum}`, isWin, winAmount: isWin ? prizes.big : 0 };
    }

    default: {
      const _: never = bet;
      throw new Error(`Unknown bet: ${_}`);
    }
  }
}

// ─────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────

/**
 * Tính tổng 3 số quay từ mảng numbers.
 *
 * Dùng khi publish result để tính sum trước khi lưu vào DrawDoc.
 * sum được lưu sẵn trong DrawDoc để tránh tính lại nhiều lần trong settle.
 */
export function computeDrawStats(numbers: number[]): { sum: number } {
  const sum = numbers.reduce((s, n) => s + n, 0);
  return { sum };
}
