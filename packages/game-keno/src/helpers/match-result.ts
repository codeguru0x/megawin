/**
 * Keno – Match Result
 *
 * So sánh lựa chọn người chơi với 20 số quay để xác định kết quả.
 * Áp dụng cho cả cách chơi cơ bản và bổ sung.
 *
 * LƯU Ý: Cả số người chơi và kết quả quay đều dùng string "01"-"80".
 * matchBasicBoard so sánh trực tiếp string.
 */

import { KenoBigSmallBet, KenoEvenOddBet, type KenoPlayType } from "../entities/enums";
import { type BigSmallPrizes, type EvenOddPrizes, KENO_BIG_SMALL_BOUNDARY } from "../entities/types";
import { lookupBasicPrize } from "../rules/prize-tables";

// ─────────────────────────────────────────────
// Draw Result (input)
// ─────────────────────────────────────────────

/**
 * Input tối giản kết quả kỳ quay cần thiết cho các hàm match.
 *
 * Tách ra khỏi `DrawResult` (entity) để helpers có thể dùng mà không
 * cần import toàn bộ entity layer — giảm coupling giữa helpers và DB layer.
 */
export interface DrawResultForMatch {
  /** 20 số trúng thưởng dạng string "01"-"80". */
  winningNumbers: string[];
  /** Số lượng số "lớn" (41-80) trong 20 số quay. */
  bigCount: number;
  /** Số lượng số "nhỏ" (1-40) trong 20 số quay. */
  smallCount: number;
  /** Số lượng số chẵn trong 20 số quay. */
  evenCount: number;
  /** Số lượng số lẻ trong 20 số quay. */
  oddCount: number;
}

// ─────────────────────────────────────────────
// Basic Match (cách chơi cơ bản)
// ─────────────────────────────────────────────

/**
 * Kết quả khớp số cho 1 board cách chơi cơ bản.
 *
 * Trả về bởi `matchBasicBoard()` — chứa đủ thông tin để:
 * - Ghi vào `EntryBoardPayout` (settleEntries step)
 * - Hiển thị cho player: "Bạn trúng X/Y số"
 */
export interface BasicMatchResult {
  /** Số lượng số người chơi trùng với kết quả quay. */
  matchCount: number;
  /** Số lượng số người chơi đã chọn (= numbers.length). */
  pickCount: number;
  /** Danh sách các số trùng (subset của numbers). */
  matchedNumbers: string[];
  /** true nếu winAmount > 0 (trúng ít nhất 1 bậc giải). */
  isWin: boolean;
  /**
   * Tiền thắng tính cho 1 đơn vị cược (VND).
   * Settle layer nhân thêm `betCount` khi ghi vào `EntryBoardPayout.winAmount`.
   */
  winAmount: number;
}

/**
 * So khớp 1 board cách chơi cơ bản với kết quả kỳ quay.
 *
 * Dùng `Set` cho `winningNumbers` → O(n) thay vì O(n²).
 * Kết quả trả về đã tính sẵn `winAmount` per-unit; settle layer
 * nhân thêm `betCount` khi ghi vào `EntryBoardPayout`.
 *
 * @param numbers - Số người chơi chọn, dạng string "01"-"80"
 * @param result - Kết quả kỳ quay (gồm winningNumbers + bigCount/smallCount...)
 * @param prizeTable - Bảng giải thưởng, key trần `pickCount` (build từ `config.basicPrizes`)
 */
export function matchBasicBoard(
  numbers: string[],
  result: DrawResultForMatch,
  prizeTable: Record<string, Record<string, number>>,
): BasicMatchResult {
  const winSet = new Set(result.winningNumbers);
  const matchedNumbers: string[] = [];

  for (const s of numbers) {
    if (winSet.has(s)) matchedNumbers.push(s);
  }

  const pickCount = numbers.length;
  const matchCount = matchedNumbers.length;
  const winAmount = lookupBasicPrize(pickCount, matchCount, prizeTable);

  return { matchCount, pickCount, matchedNumbers, isWin: winAmount > 0, winAmount };
}

// ─────────────────────────────────────────────
// Side Bet Match (cách chơi bổ sung)
// ─────────────────────────────────────────────

/**
 * Kết quả khớp cho 1 side bet (Lớn/Nhỏ hoặc Chẵn/Lẻ).
 *
 * Trả về bởi `matchBigSmallBet()` / `matchEvenOddBet()`.
 * Settle layer dùng để điền `EntrySideBetPayout`.
 */
export interface SideBetMatchResult {
  /**
   * Mô tả trạng thái kỳ quay đối với bet này.
   * Ví dụ: "big13Plus", "small1112", "draw", "even1314", "odd15Plus"...
   *
   * LƯU Ý: `outcome` mô tả trạng thái DRAW, không phải win/lose của player.
   * Player đặt "big", draw ra 8 số lớn → outcome = "big8", isWin = false.
   */
  outcome: string;
  /**
   * Convenience alias cho `winAmount > 0`.
   * Invariant: isWin = true ↔ winAmount > 0. Không có ngoại lệ.
   * Lưu kèm winAmount để client đọc win/lose trực tiếp mà không cần so sánh số.
   */
  isWin: boolean;
  /**
   * Tiền thắng tính cho 1 đơn vị cược (VND).
   * Settle layer nhân thêm `betCount` khi ghi vào `EntrySideBetPayout.winAmount`.
   */
  winAmount: number;
}

/**
 * So khớp cược Lớn/Nhỏ với kết quả kỳ quay.
 *
 * Logic phân loại outcome dựa trên `bigCount` và `smallCount`:
 * - Cược "big": trúng nếu bigCount ≥ 11, hoàn vốn nếu 11-12, thua nếu < 11
 * - Cược "bigSmallDraw": trúng khi bigCount = smallCount = 10
 * - Cược "small": đối xứng với "big"
 *
 * @param bet - Lựa chọn người chơi đặt (big / bigSmallDraw / small)
 * @param result - Kết quả kỳ quay (cần bigCount, smallCount)
 * @param prizes - Bảng giải thưởng Lớn/Nhỏ (từ `config.bigSmallPrizes`)
 */
export function matchBigSmallBet(
  bet: KenoBigSmallBet,
  result: DrawResultForMatch,
  prizes: BigSmallPrizes,
): SideBetMatchResult {
  const { bigCount, smallCount } = result;

  switch (bet) {
    case KenoBigSmallBet.Big: {
      if (bigCount >= 13) return { outcome: "big13Plus", isWin: true, winAmount: prizes.big13Plus };
      if (bigCount === 11 || bigCount === 12) return { outcome: "big1112", isWin: true, winAmount: prizes.big1112 };
      return { outcome: `big${bigCount}`, isWin: false, winAmount: 0 };
    }

    case KenoBigSmallBet.BigSmallDraw: {
      if (bigCount === 10 && smallCount === 10) return { outcome: "draw", isWin: true, winAmount: prizes.draw };
      return { outcome: `big${bigCount}_small${smallCount}`, isWin: false, winAmount: 0 };
    }

    case KenoBigSmallBet.Small: {
      if (smallCount >= 13) return { outcome: "small13Plus", isWin: true, winAmount: prizes.small13Plus };
      if (smallCount === 11 || smallCount === 12)
        return { outcome: "small1112", isWin: true, winAmount: prizes.small1112 };
      return { outcome: `small${smallCount}`, isWin: false, winAmount: 0 };
    }

    default: {
      const _: never = bet;
      throw new Error(`Unknown bet: ${_}`);
    }
  }
}

/**
 * So khớp cược Chẵn/Lẻ với kết quả kỳ quay.
 *
 * Logic phân loại outcome dựa trên `evenCount` và `oddCount`:
 * - Cược "even": trúng lớn nếu ≥15 chẵn, trúng nhỏ nếu 13-14, thua nếu < 13
 * - Cược "even1112": trúng chỉ khi evenCount = 11 hoặc 12
 * - Cược "evenOddDraw": trúng khi evenCount = oddCount = 10
 * - Cược "odd1112": đối xứng với "even1112"
 * - Cược "odd": đối xứng với "even"
 *
 * @param bet - Lựa chọn người chơi đặt
 * @param result - Kết quả kỳ quay (cần evenCount, oddCount)
 * @param prizes - Bảng giải thưởng Chẵn/Lẻ (từ `config.evenOddPrizes`)
 */
export function matchEvenOddBet(
  bet: KenoEvenOddBet,
  result: DrawResultForMatch,
  prizes: EvenOddPrizes,
): SideBetMatchResult {
  const { evenCount, oddCount } = result;

  switch (bet) {
    case KenoEvenOddBet.Even: {
      if (evenCount >= 15) return { outcome: "even15Plus", isWin: true, winAmount: prizes.even15Plus };
      if (evenCount === 13 || evenCount === 14) return { outcome: "even1314", isWin: true, winAmount: prizes.even1314 };
      return { outcome: `even${evenCount}`, isWin: false, winAmount: 0 };
    }

    case KenoEvenOddBet.Even1112: {
      if (evenCount === 11 || evenCount === 12) return { outcome: "even1112", isWin: true, winAmount: prizes.even1112 };
      return { outcome: `even${evenCount}`, isWin: false, winAmount: 0 };
    }

    case KenoEvenOddBet.EvenOddDraw: {
      if (evenCount === 10 && oddCount === 10) return { outcome: "draw", isWin: true, winAmount: prizes.draw };
      return { outcome: `even${evenCount}_odd${oddCount}`, isWin: false, winAmount: 0 };
    }

    case KenoEvenOddBet.Odd1112: {
      if (oddCount === 11 || oddCount === 12) return { outcome: "odd1112", isWin: true, winAmount: prizes.odd1112 };
      return { outcome: `odd${oddCount}`, isWin: false, winAmount: 0 };
    }

    case KenoEvenOddBet.Odd: {
      if (oddCount >= 15) return { outcome: "odd15Plus", isWin: true, winAmount: prizes.odd15Plus };
      if (oddCount === 13 || oddCount === 14) return { outcome: "odd1314", isWin: true, winAmount: prizes.odd1314 };
      return { outcome: `odd${oddCount}`, isWin: false, winAmount: 0 };
    }

    default: {
      const _: never = bet;
      throw new Error(`Unknown bet: ${_}`);
    }
  }
}

// ─────────────────────────────────────────────
// Draw Result Stats
// ─────────────────────────────────────────────

/**
 * Tính bigCount, smallCount, evenCount, oddCount từ 20 số quay.
 *
 * Gọi sau khi nhận `winningNumbers` từ Vietlott — kết quả lưu vào
 * `DrawResult` (draw entity) và copy sang `EntryResult` (entry entity)
 * khi settle để tiện tra cứu mà không cần join draw.
 *
 * @param winningNumbers - Mảng 20 số dạng string "01"-"80"
 */
export function computeDrawStats(winningNumbers: string[]): {
  bigCount: number;
  smallCount: number;
  evenCount: number;
  oddCount: number;
} {
  let bigCount = 0;
  let smallCount = 0;
  let evenCount = 0;
  let oddCount = 0;

  for (const s of winningNumbers) {
    const n = parseInt(s, 10);
    if (n > KENO_BIG_SMALL_BOUNDARY) bigCount++;
    else smallCount++;

    if (n % 2 === 0) evenCount++;
    else oddCount++;
  }

  return { bigCount, smallCount, evenCount, oddCount };
}
