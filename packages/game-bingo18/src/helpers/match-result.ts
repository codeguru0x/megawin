/**
 * Bingo 18 – Match Result
 *
 * So sánh lựa chọn người chơi với 3 số quay để xác định kết quả.
 */

import {
  Bingo18BigSmallBet,
  Bingo18TripleKind,
} from "../entities/enums";
import {
  BINGO18_SMALL_MAX,
  BINGO18_BIG_MIN,
} from "../entities/types";
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
// Draw Result (input)
// ─────────────────────────────────────────────

export interface DrawResultForMatch {
  /** 3 số kết quả quay. */
  numbers: number[];
  /** Tổng 3 số. */
  sum: number;
}

// ─────────────────────────────────────────────
// Single Number Match
// ─────────────────────────────────────────────

export interface SingleNumMatchResult {
  matchCount: number;
  winAmount: number;
}

export function matchSingleNum(
  selectedNumber: number,
  result: DrawResultForMatch,
  prizes: SingleNumPrizes = DEFAULT_SINGLE_NUM_PRIZES,
): SingleNumMatchResult {
  const matchCount = result.numbers.filter((n) => n === selectedNumber).length;
  let winAmount = 0;
  if (matchCount === 1) winAmount = prizes.match1;
  else if (matchCount === 2) winAmount = prizes.match2;
  else if (matchCount === 3) winAmount = prizes.match3;

  return { matchCount, winAmount };
}

// ─────────────────────────────────────────────
// Double Match
// ─────────────────────────────────────────────

export interface DoubleMatchResult {
  matchCount: number;
  isWin: boolean;
  winAmount: number;
}

export function matchDoubleMatch(
  selectedNumber: number,
  result: DrawResultForMatch,
  prizes: DoubleMatchPrizes = DEFAULT_DOUBLE_MATCH_PRIZES,
): DoubleMatchResult {
  const matchCount = result.numbers.filter((n) => n === selectedNumber).length;
  const isWin = matchCount >= 2;
  return { matchCount, isWin, winAmount: isWin ? prizes.win : 0 };
}

// ─────────────────────────────────────────────
// Triple Match
// ─────────────────────────────────────────────

export interface TripleMatchResult {
  isWin: boolean;
  winAmount: number;
}

export function matchTripleMatch(
  kind: Bingo18TripleKind,
  selectedNumber: number | undefined,
  result: DrawResultForMatch,
  prizes: TripleMatchPrizes = DEFAULT_TRIPLE_MATCH_PRIZES,
): TripleMatchResult {
  const [a, b, c] = result.numbers;
  const allSame = a === b && b === c;

  if (kind === Bingo18TripleKind.Specific) {
    const isWin = allSame && a === selectedNumber;
    return { isWin, winAmount: isWin ? prizes.specific : 0 };
  }

  return { isWin: allSame, winAmount: allSame ? prizes.any : 0 };
}

// ─────────────────────────────────────────────
// Sum Total Match
// ─────────────────────────────────────────────

export interface SumTotalMatchResult {
  outcome: string;
  isWin: boolean;
  winAmount: number;
}

export function matchSumTotal(
  selectedSum: number,
  result: DrawResultForMatch,
  prizes: SumTotalPrizes = DEFAULT_SUM_TOTAL_PRIZES,
): SumTotalMatchResult {
  const isWin = result.sum === selectedSum;
  return {
    outcome: `sum${result.sum}`,
    isWin,
    winAmount: isWin ? (prizes[selectedSum] ?? 0) : 0,
  };
}

// ─────────────────────────────────────────────
// Big/Small/Draw Match
// ─────────────────────────────────────────────

export interface BigSmallDrawMatchResult {
  outcome: string;
  isWin: boolean;
  winAmount: number;
}

export function matchBigSmallDraw(
  bet: Bingo18BigSmallBet,
  result: DrawResultForMatch,
  prizes: BigSmallDrawPrizes = DEFAULT_BIG_SMALL_DRAW_PRIZES,
): BigSmallDrawMatchResult {
  const { sum } = result;

  switch (bet) {
    case Bingo18BigSmallBet.Small: {
      const isWin = sum <= BINGO18_SMALL_MAX;
      return { outcome: `small_sum${sum}`, isWin, winAmount: isWin ? prizes.small : 0 };
    }
    case Bingo18BigSmallBet.Draw: {
      const isWin = sum === 10 || sum === 11;
      return { outcome: `draw_sum${sum}`, isWin, winAmount: isWin ? prizes.draw : 0 };
    }
    case Bingo18BigSmallBet.Big: {
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
// Draw Result Stats
// ─────────────────────────────────────────────

export function computeDrawStats(numbers: number[]): {
  sum: number;
} {
  const sum = numbers.reduce((s, n) => s + n, 0);
  return { sum };
}
