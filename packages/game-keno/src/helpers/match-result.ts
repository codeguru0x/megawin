/**
 * Keno – Match Result
 *
 * So sánh lựa chọn người chơi với 20 số quay để xác định kết quả.
 * Áp dụng cho cả cách chơi cơ bản và bổ sung.
 *
 * LƯU Ý: Số người chơi lưu dạng string "01"-"80".
 * Kết quả quay (winningNumbers) lưu dạng number[].
 * matchBasicBoard nhận string[], convert sang number để so sánh.
 */

import {
  KenoBigSmallBet,
  KenoEvenOddBet,
  type KenoPlayType,
} from "../entities/enums";
import { KENO_BIG_SMALL_BOUNDARY } from "../entities/types";
import {
  lookupBasicPrize,
  DEFAULT_BIG_SMALL_PRIZES,
  DEFAULT_EVEN_ODD_PRIZES,
} from "../rules/prize-tables";

// ─────────────────────────────────────────────
// Draw Result (input)
// ─────────────────────────────────────────────

export interface DrawResultForMatch {
  winningNumbers: number[];
  bigCount: number;
  smallCount: number;
  evenCount: number;
  oddCount: number;
}

// ─────────────────────────────────────────────
// Basic Match (cách chơi cơ bản)
// ─────────────────────────────────────────────

export interface BasicMatchResult {
  matchCount: number;
  pickCount: number;
  matchedNumbers: number[];
  winAmount: number;
}

/**
 * Match 1 board cơ bản với kết quả quay.
 * @param numbers - Số dạng string "01"-"80" từ board
 * @param result - Kết quả quay (number[])
 */
export function matchBasicBoard(
  numbers: string[],
  result: DrawResultForMatch,
  prizeTable?: Record<number, Record<number, number>>,
): BasicMatchResult {
  const winSet = new Set(result.winningNumbers);
  const matchedNumbers: number[] = [];

  for (const s of numbers) {
    const n = parseInt(s, 10);
    if (winSet.has(n)) matchedNumbers.push(n);
  }

  const pickCount = numbers.length;
  const matchCount = matchedNumbers.length;
  const winAmount = lookupBasicPrize(pickCount, matchCount, prizeTable);

  return { matchCount, pickCount, matchedNumbers, winAmount };
}

// ─────────────────────────────────────────────
// Side Bet Match (cách chơi bổ sung)
// ─────────────────────────────────────────────

export interface SideBetMatchResult {
  outcome: string;
  isWin: boolean;
  winAmount: number;
}

export function matchBigSmallBet(
  bet: KenoBigSmallBet,
  result: DrawResultForMatch,
  prizes = DEFAULT_BIG_SMALL_PRIZES,
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
      if (smallCount === 11 || smallCount === 12) return { outcome: "small1112", isWin: true, winAmount: prizes.small1112 };
      return { outcome: `small${smallCount}`, isWin: false, winAmount: 0 };
    }

    default: {
      const _: never = bet;
      throw new Error(`Unknown bet: ${_}`);
    }
  }
}

export function matchEvenOddBet(
  bet: KenoEvenOddBet,
  result: DrawResultForMatch,
  prizes = DEFAULT_EVEN_ODD_PRIZES,
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

export function computeDrawStats(winningNumbers: number[]): {
  bigCount: number;
  smallCount: number;
  evenCount: number;
  oddCount: number;
} {
  let bigCount = 0;
  let smallCount = 0;
  let evenCount = 0;
  let oddCount = 0;

  for (const n of winningNumbers) {
    if (n > KENO_BIG_SMALL_BOUNDARY) bigCount++;
    else smallCount++;

    if (n % 2 === 0) evenCount++;
    else oddCount++;
  }

  return { bigCount, smallCount, evenCount, oddCount };
}
