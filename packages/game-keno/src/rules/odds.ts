/**
 * Keno – Odds & Profit Calculator
 *
 * Tính toán xác suất trúng thưởng và phân tích lợi nhuận
 * dựa trên quy tắc game Keno.
 *
 * Không gian mẫu:
 *   - 80 số, quay 20 số → C(80,20) = 3,535,027,396,898,400
 *   - Người chơi chọn k số (1 ≤ k ≤ 10)
 *
 * Xác suất trùng đúng m số khi chọn k số:
 *   P(m | k) = C(k, m) × C(80-k, 20-m) / C(80, 20)
 *
 * Trong đó:
 *   C(k, m)       = số cách chọn m số trùng từ k số đã chọn
 *   C(80-k, 20-m) = số cách quay 20-m số không trùng từ 80-k số còn lại
 *   C(80, 20)      = tổng không gian mẫu
 *
 * Bảng giải thưởng cách chơi Lớn/Nhỏ:
 *   Xác suất dựa trên phân phối siêu hình học (hypergeometric)
 *   của 20 số quay trong pool 80 (40 lớn + 40 nhỏ).
 *
 * Bảng giải thưởng cách chơi Chẵn/Lẻ:
 *   Xác suất dựa trên phân phối siêu hình học
 *   của 20 số quay trong pool 80 (40 chẵn + 40 lẻ).
 */

import {
  KENO_NUMBER_MAX,
  KENO_DRAW_COUNT,
  KENO_PICK_MIN,
  KENO_PICK_MAX,
  KENO_BIG_SMALL_BOUNDARY,
} from "../entities/types";

const POOL = KENO_NUMBER_MAX; // 80
const DRAW = KENO_DRAW_COUNT; // 20

// ─────────────────────────────────────────────
// Combination helper (big numbers)
// ─────────────────────────────────────────────

/**
 * Tính C(n, k) bằng BigInt để tránh mất precision với số lớn.
 * C(80,20) ≈ 3.535 × 10^15 – vượt quá Number.MAX_SAFE_INTEGER.
 */
function combinationBig(n: number, k: number): bigint {
  if (k < 0 || k > n) return 0n;
  if (k === 0 || k === n) return 1n;
  const kk = Math.min(k, n - k);
  let result = 1n;
  for (let i = 0; i < kk; i++) {
    result = (result * BigInt(n - i)) / BigInt(i + 1);
  }
  return result;
}

/**
 * C(n, k) trả về number (dùng khi kết quả đủ nhỏ).
 */
function combination(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  const kk = Math.min(k, n - k);
  let result = 1;
  for (let i = 0; i < kk; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return Math.round(result);
}

// ─────────────────────────────────────────────
// Total Outcomes
// ─────────────────────────────────────────────

/**
 * Tổng không gian mẫu = C(80, 20).
 * ≈ 3,535,027,396,898,400
 */
export const TOTAL_OUTCOMES = combinationBig(POOL, DRAW);

// ─────────────────────────────────────────────
// Basic Play Odds (pick1 – pick10)
// ─────────────────────────────────────────────

/** Thông tin xác suất cho 1 mức thưởng trong 1 bậc chơi. */
export interface KenoTierOdds {
  /** Số lượng số chọn (1-10). */
  pickCount: number;
  /** Số lượng số trùng. */
  matchCount: number;
  /** Số cách trúng (favorable outcomes) dạng BigInt. */
  waysBig: bigint;
  /** Xác suất P = ways / TOTAL_OUTCOMES. */
  probability: number;
  /** 1 in N (inverse of probability). */
  oneInN: number;
}

/**
 * Tính số cách trúng đúng m số khi chọn k số từ pool 80, quay 20 số.
 * = C(k, m) × C(80-k, 20-m)
 */
function matchWays(k: number, m: number): bigint {
  return combinationBig(k, m) * combinationBig(POOL - k, DRAW - m);
}

/**
 * Tính xác suất cho tất cả mức thưởng có giải của 1 bậc chơi.
 */
export function getOddsForPick(
  pickCount: number,
  matchCounts: number[]
): KenoTierOdds[] {
  return matchCounts.map((matchCount) => {
    const waysBig = matchWays(pickCount, matchCount);
    const probability =
      Number((waysBig * 1_000_000_000_000n) / TOTAL_OUTCOMES) /
      1_000_000_000_000;
    const oneInN = probability > 0 ? 1 / probability : Infinity;
    return { pickCount, matchCount, waysBig, probability, oneInN };
  });
}

/**
 * Bảng match counts có giải cho mỗi bậc.
 * Chỉ bao gồm matchCount có giải (từ DEFAULT_BASIC_PRIZE_TABLE).
 */
const PICK_MATCH_COUNTS: Record<number, number[]> = {
  1: [1],
  2: [2],
  3: [3, 2],
  4: [4, 3, 2],
  5: [5, 4, 3, 2],
  6: [6, 5, 4, 3],
  7: [7, 6, 5, 4, 3],
  8: [8, 7, 6, 5, 4, 3, 0],
  9: [9, 8, 7, 6, 5, 4, 0],
  10: [10, 9, 8, 7, 6, 5, 0],
};

/**
 * Bảng xác suất đầy đủ cho tất cả 10 bậc chơi cơ bản.
 * Kết quả tính sẵn, immutable.
 */
export function getBasicOddsTable(): Map<number, KenoTierOdds[]> {
  const table = new Map<number, KenoTierOdds[]>();
  for (let pick = KENO_PICK_MIN; pick <= KENO_PICK_MAX; pick++) {
    const matchCounts = PICK_MATCH_COUNTS[pick] ?? [];
    table.set(pick, getOddsForPick(pick, matchCounts));
  }
  return table;
}

// ─────────────────────────────────────────────
// Side Bet Odds (Lớn/Nhỏ, Chẵn/Lẻ)
// ─────────────────────────────────────────────

/**
 * Xác suất có đúng x số "lớn" (41-80) trong 20 số quay.
 * Pool: 40 số lớn + 40 số nhỏ, quay 20 số.
 * P(bigCount = x) = C(40, x) × C(40, 20-x) / C(80, 20)
 *
 * Tương tự cho Chẵn/Lẻ vì pool cũng chia 40/40.
 */
export interface SideBetOdds {
  label: string;
  count: number | string;
  waysBig: bigint;
  probability: number;
  oneInN: number;
}

function sideBetWays(favorableCount: number): bigint {
  const half = KENO_BIG_SMALL_BOUNDARY; // 40
  return (
    combinationBig(half, favorableCount) *
    combinationBig(half, DRAW - favorableCount)
  );
}

/**
 * Xác suất cho cược Lớn/Nhỏ.
 *
 * bigCount ≥ 13 → Lớn thắng (prize big13Plus)
 * bigCount = 11 or 12 → Lớn hoàn vốn (prize big1112)
 * bigCount = 10 → Hoà (prize draw)
 * smallCount ≥ 13 → Nhỏ thắng
 * smallCount = 11 or 12 → Nhỏ hoàn vốn
 */
export function getBigSmallOdds(): {
  big13Plus: SideBetOdds;
  big1112: SideBetOdds;
  draw: SideBetOdds;
  small1112: SideBetOdds;
  small13Plus: SideBetOdds;
} {
  const ways13Plus = (function () {
    let total = 0n;
    for (let x = 13; x <= 20; x++) total += sideBetWays(x);
    return total;
  })();

  const ways1112 = sideBetWays(11) + sideBetWays(12);
  const waysDraw = sideBetWays(10);

  const toOdds = (label: string, count: string, w: bigint): SideBetOdds => {
    const prob =
      Number((w * 1_000_000_000_000n) / TOTAL_OUTCOMES) / 1_000_000_000_000;
    return {
      label,
      count,
      waysBig: w,
      probability: prob,
      oneInN: prob > 0 ? 1 / prob : Infinity,
    };
  };

  return {
    big13Plus: toOdds("Lớn (≥13)", "≥13", ways13Plus),
    big1112: toOdds("Lớn (11-12)", "11-12", ways1112),
    draw: toOdds("Hoà (10-10)", "10", waysDraw),
    small1112: toOdds("Nhỏ (11-12)", "11-12", ways1112),
    small13Plus: toOdds("Nhỏ (≥13)", "≥13", ways13Plus),
  };
}

/**
 * Xác suất cho cược Chẵn/Lẻ.
 * Cùng phân phối hypergeometric với 40 chẵn / 40 lẻ.
 */
export function getEvenOddOdds(): {
  even15Plus: SideBetOdds;
  even1314: SideBetOdds;
  even1112: SideBetOdds;
  draw: SideBetOdds;
  odd1112: SideBetOdds;
  odd1314: SideBetOdds;
  odd15Plus: SideBetOdds;
} {
  const ways15Plus = (function () {
    let total = 0n;
    for (let x = 15; x <= 20; x++) total += sideBetWays(x);
    return total;
  })();

  const ways1314 = sideBetWays(13) + sideBetWays(14);
  const ways1112 = sideBetWays(11) + sideBetWays(12);
  const waysDraw = sideBetWays(10);

  const toOdds = (label: string, count: string, w: bigint): SideBetOdds => {
    const prob =
      Number((w * 1_000_000_000_000n) / TOTAL_OUTCOMES) / 1_000_000_000_000;
    return {
      label,
      count,
      waysBig: w,
      probability: prob,
      oneInN: prob > 0 ? 1 / prob : Infinity,
    };
  };

  return {
    even15Plus: toOdds("Chẵn (≥15)", "≥15", ways15Plus),
    even1314: toOdds("Chẵn (13-14)", "13-14", ways1314),
    even1112: toOdds("Chẵn (11-12)", "11-12", ways1112),
    draw: toOdds("Hoà (10-10)", "10", waysDraw),
    odd1112: toOdds("Lẻ (11-12)", "11-12", ways1112),
    odd1314: toOdds("Lẻ (13-14)", "13-14", ways1314),
    odd15Plus: toOdds("Lẻ (≥15)", "≥15", ways15Plus),
  };
}

// ─────────────────────────────────────────────
// Profit Analysis (Basic Play)
// ─────────────────────────────────────────────

/** Phân tích lợi nhuận cho 1 mức thưởng. */
export interface TierProfitAnalysis {
  pickCount: number;
  matchCount: number;
  probability: number;
  oneInN: number;
  currentPrize: number;
  /** Expected payout per ticket = probability × prize. */
  expectedPayout: number;
  /** payoutRatio = expectedPayout / unitPrice. */
  payoutRatio: number;
  /** Giá trị giải thưởng tối đa để hoà vốn = unitPrice / probability. */
  breakEvenPrize: number;
}

/** Tổng hợp lợi nhuận toàn bộ 1 bậc chơi. */
export interface PickProfitSummary {
  pickCount: number;
  unitPrice: number;
  tiers: TierProfitAnalysis[];
  totalExpectedPayout: number;
  totalPayoutRatio: number;
  grossMarginPerTicket: number;
  grossMarginPercent: number;
}

/**
 * Phân tích lợi nhuận cho 1 bậc chơi.
 *
 * @param pickCount - Số lượng số chọn (1-10)
 * @param prizes - Map matchCount → prize VND (từ config)
 * @param unitPrice - Mệnh giá (VND)
 */
export function analyzeProfitabilityForPick(
  pickCount: number,
  prizes: Record<number, number>,
  unitPrice: number
): PickProfitSummary {
  const matchCounts = PICK_MATCH_COUNTS[pickCount] ?? [];
  const odds = getOddsForPick(pickCount, matchCounts);

  const tiers: TierProfitAnalysis[] = odds.map((o) => {
    const currentPrize = prizes[o.matchCount] ?? 0;
    const expectedPayout = o.probability * currentPrize;
    const payoutRatio = unitPrice > 0 ? expectedPayout / unitPrice : 0;
    const breakEvenPrize =
      o.probability > 0 ? unitPrice / o.probability : Infinity;

    return {
      pickCount: o.pickCount,
      matchCount: o.matchCount,
      probability: o.probability,
      oneInN: o.oneInN,
      currentPrize,
      expectedPayout,
      payoutRatio,
      breakEvenPrize,
    };
  });

  const totalExpectedPayout = tiers.reduce((s, t) => s + t.expectedPayout, 0);
  const totalPayoutRatio = unitPrice > 0 ? totalExpectedPayout / unitPrice : 0;
  const grossMarginPerTicket = unitPrice - totalExpectedPayout;
  const grossMarginPercent =
    unitPrice > 0 ? (grossMarginPerTicket / unitPrice) * 100 : 0;

  return {
    pickCount,
    unitPrice,
    tiers,
    totalExpectedPayout,
    totalPayoutRatio,
    grossMarginPerTicket,
    grossMarginPercent,
  };
}

/**
 * Phân tích lợi nhuận cho TẤT CẢ 10 bậc chơi cơ bản.
 *
 * @param basicPrizes - Bảng giải thưởng (từ config.basicPrizes)
 * @param unitPrice - Mệnh giá (VND)
 */
export function analyzeAllPicksProfitability(
  basicPrizes: Record<string, Record<number, number>>,
  unitPrice: number
): PickProfitSummary[] {
  const summaries: PickProfitSummary[] = [];
  for (let pick = KENO_PICK_MIN; pick <= KENO_PICK_MAX; pick++) {
    const prizes = basicPrizes[`pick${pick}`] ?? {};
    summaries.push(analyzeProfitabilityForPick(pick, prizes, unitPrice));
  }
  return summaries;
}

/** Phân tích lợi nhuận cho cược Lớn/Nhỏ. */
export interface SideBetProfitAnalysis {
  label: string;
  probability: number;
  oneInN: number;
  currentPrize: number;
  expectedPayout: number;
  payoutRatio: number;
  breakEvenPrize: number;
}

/**
 * Phân tích lợi nhuận cho cược Lớn/Nhỏ.
 */
export function analyzeBigSmallProfitability(
  prizes: {
    big13Plus: number;
    big1112: number;
    draw: number;
    small1112: number;
    small13Plus: number;
  },
  unitPrice: number
): {
  tiers: SideBetProfitAnalysis[];
  totalExpectedPayout: number;
  totalPayoutRatio: number;
  grossMarginPercent: number;
} {
  const odds = getBigSmallOdds();

  const analyze = (
    label: string,
    prob: number,
    prize: number
  ): SideBetProfitAnalysis => ({
    label,
    probability: prob,
    oneInN: prob > 0 ? 1 / prob : Infinity,
    currentPrize: prize,
    expectedPayout: prob * prize,
    payoutRatio: unitPrice > 0 ? (prob * prize) / unitPrice : 0,
    breakEvenPrize: prob > 0 ? unitPrice / prob : Infinity,
  });

  const tiers = [
    analyze("Lớn (≥13)", odds.big13Plus.probability, prizes.big13Plus),
    analyze("Lớn (11-12)", odds.big1112.probability, prizes.big1112),
    analyze("Hoà LN", odds.draw.probability, prizes.draw),
    analyze("Nhỏ (11-12)", odds.small1112.probability, prizes.small1112),
    analyze("Nhỏ (≥13)", odds.small13Plus.probability, prizes.small13Plus),
  ];

  const totalExpectedPayout = tiers.reduce((s, t) => s + t.expectedPayout, 0);
  const totalPayoutRatio = unitPrice > 0 ? totalExpectedPayout / unitPrice : 0;
  return {
    tiers,
    totalExpectedPayout,
    totalPayoutRatio,
    grossMarginPercent: (1 - totalPayoutRatio) * 100,
  };
}

/**
 * Phân tích lợi nhuận cho cược Chẵn/Lẻ.
 */
export function analyzeEvenOddProfitability(
  prizes: {
    even15Plus: number;
    even1314: number;
    even1112: number;
    draw: number;
    odd1112: number;
    odd1314: number;
    odd15Plus: number;
  },
  unitPrice: number
): {
  tiers: SideBetProfitAnalysis[];
  totalExpectedPayout: number;
  totalPayoutRatio: number;
  grossMarginPercent: number;
} {
  const odds = getEvenOddOdds();

  const analyze = (
    label: string,
    prob: number,
    prize: number
  ): SideBetProfitAnalysis => ({
    label,
    probability: prob,
    oneInN: prob > 0 ? 1 / prob : Infinity,
    currentPrize: prize,
    expectedPayout: prob * prize,
    payoutRatio: unitPrice > 0 ? (prob * prize) / unitPrice : 0,
    breakEvenPrize: prob > 0 ? unitPrice / prob : Infinity,
  });

  const tiers = [
    analyze("Chẵn (≥15)", odds.even15Plus.probability, prizes.even15Plus),
    analyze("Chẵn (13-14)", odds.even1314.probability, prizes.even1314),
    analyze("Chẵn (11-12)", odds.even1112.probability, prizes.even1112),
    analyze("Hoà CL", odds.draw.probability, prizes.draw),
    analyze("Lẻ (11-12)", odds.odd1112.probability, prizes.odd1112),
    analyze("Lẻ (13-14)", odds.odd1314.probability, prizes.odd1314),
    analyze("Lẻ (≥15)", odds.odd15Plus.probability, prizes.odd15Plus),
  ];

  const totalExpectedPayout = tiers.reduce((s, t) => s + t.expectedPayout, 0);
  const totalPayoutRatio = unitPrice > 0 ? totalExpectedPayout / unitPrice : 0;
  return {
    tiers,
    totalExpectedPayout,
    totalPayoutRatio,
    grossMarginPercent: (1 - totalPayoutRatio) * 100,
  };
}
