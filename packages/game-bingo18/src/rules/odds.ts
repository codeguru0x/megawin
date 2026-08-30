/**
 * Bingo 18 – Odds & Profit Calculator
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * I. MÔ TẢ TRÒ CHƠI
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *   Bingo 18 quay 3 số, mỗi số lấy ngẫu nhiên từ {1,2,3,4,5,6}.
 *   Tổng không gian mẫu: 6^3 = 216 trường hợp.
 *
 *   Giá vé mặc định: 10.000 VND / lần tham gia / cách chơi (`play.unitPrice`).
 *   Lịch quay mặc định: mỗi 6 phút, 06:06 – 21:53 → 158 kỳ/ngày. Cả 3 tham số
 *   (`drawIntervalMinutes`, `firstDrawTime`, `lastDrawTime`) đều cấu hình được nên
 *   số kỳ/ngày phải tính lại theo config, KHÔNG coi là hằng số.
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * II. XÁC SUẤT – MỘT SỐ (singleNum)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *   Chọn 1 số N (1-6). Quay 3 lần, mỗi lần P(N) = 1/6.
 *   Số lần xuất hiện ~ Binomial(3, 1/6).
 *
 *   P(xuất hiện 0 lần) = (5/6)^3 = 125/216 ≈ 57.87%
 *   P(xuất hiện 1 lần) = C(3,1)×(1/6)^1×(5/6)^2 = 75/216 ≈ 34.72%
 *   P(xuất hiện 2 lần) = C(3,2)×(1/6)^2×(5/6)^1 = 15/216 ≈ 6.94%
 *   P(xuất hiện 3 lần) = (1/6)^3 = 1/216 ≈ 0.46%
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * III. XÁC SUẤT – HAI SỐ TRÙNG NHAU (doubleMatch)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *   Chọn cặp số N. Thắng nếu ít nhất 2/3 số quay = N.
 *   P(≥2) = P(2) + P(3) = 15/216 + 1/216 = 16/216 ≈ 7.41%
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * IV. XÁC SUẤT – BA SỐ TRÙNG NHAU (tripleMatch)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *   Cụ thể: P(3 số đều = N) = 1/216 ≈ 0.46%
 *   Bất kỳ: P(3 số giống nhau) = 6/216 = 1/36 ≈ 2.78%
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * V. XÁC SUẤT – CỘNG TỔNG (sumTotal)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *   Tổng 3 số (3-18). Phân phối đối xứng quanh 10.5.
 *   Tổng ways = 216.
 *
 *   Sum=3:  1 way (1,1,1)                     P ≈ 0.46%
 *   Sum=4:  3 ways (1,1,2)×3                  P ≈ 1.39%
 *   Sum=5:  6 ways (1,1,3)×3+(1,2,2)×3        P ≈ 2.78%
 *   Sum=6:  10 ways                            P ≈ 4.63%
 *   Sum=7:  15 ways                            P ≈ 6.94%
 *   Sum=8:  21 ways                            P ≈ 9.72%
 *   Sum=9:  25 ways                            P ≈ 11.57%
 *   Sum=10: 27 ways                            P ≈ 12.50%
 *   Sum=11: 27 ways                            P ≈ 12.50%
 *   (đối xứng cho 12-18)
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * VI. XÁC SUẤT – LỚN / HOÀ / NHỎ (bigSmallDraw)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *   3 cửa cược ĐỘC LẬP, phủ kín 216 tổ hợp, KHÔNG loại trừ bộ ba trùng:
 *     Nhỏ  (tổng 3-9)   = 1+3+6+10+15+21+25 = 81/216 = 37,50%
 *     Hoà  (tổng 10-11) = 27+27             = 54/216 = 25,00%
 *     Lớn  (tổng 12-18) = 25+21+15+10+6+3+1 = 81/216 = 37,50%
 *
 *   Phân phối ĐỐI XỨNG quanh 10,5 → Nhỏ và Lớn bằng nhau đúng 81 ways.
 *   Kiểm tra: 81 + 54 + 81 = 216 ✓
 */

import {
  BINGO18_BIG_MIN,
  BINGO18_DICE_MAX,
  BINGO18_DICE_MIN,
  BINGO18_SMALL_MAX,
  BINGO18_SUM_MAX,
  BINGO18_SUM_MIN,
} from "../entities/types";

/** Tổng không gian mẫu = 6^3. */
export const TOTAL_OUTCOMES = 216;

// ─────────────────────────────────────────────
// Sum distribution (tính trước)
// ─────────────────────────────────────────────

function computeSumWays(): Map<number, number> {
  const ways = new Map<number, number>();
  for (let a = BINGO18_DICE_MIN; a <= BINGO18_DICE_MAX; a++) {
    for (let b = BINGO18_DICE_MIN; b <= BINGO18_DICE_MAX; b++) {
      for (let c = BINGO18_DICE_MIN; c <= BINGO18_DICE_MAX; c++) {
        const s = a + b + c;
        ways.set(s, (ways.get(s) ?? 0) + 1);
      }
    }
  }
  return ways;
}

const SUM_WAYS = computeSumWays();

// ─────────────────────────────────────────────
// Single Number Odds
// ─────────────────────────────────────────────

export interface SingleNumOdds {
  matchCount: number;
  ways: number;
  probability: number;
  oneInN: number;
}

export function getSingleNumOdds(): SingleNumOdds[] {
  const C = [1, 3, 3, 1];
  const results: SingleNumOdds[] = [];

  for (let m = 1; m <= 3; m++) {
    const ways = C[m]! * 5 ** (3 - m);
    const probability = ways / TOTAL_OUTCOMES;
    results.push({
      matchCount: m,
      ways,
      probability,
      oneInN: 1 / probability,
    });
  }

  return results;
}

// ─────────────────────────────────────────────
// Double Match Odds
// ─────────────────────────────────────────────

export interface DoubleMatchOdds {
  ways: number;
  probability: number;
  oneInN: number;
}

export function getDoubleMatchOdds(): DoubleMatchOdds {
  const waysExact2 = 3 * 5;
  const waysExact3 = 1;
  const ways = waysExact2 + waysExact3;
  const probability = ways / TOTAL_OUTCOMES;
  return { ways, probability, oneInN: 1 / probability };
}

// ─────────────────────────────────────────────
// Triple Match Odds
// ─────────────────────────────────────────────

export interface TripleMatchOdds {
  specific: { ways: number; probability: number; oneInN: number };
  any: { ways: number; probability: number; oneInN: number };
}

export function getTripleMatchOdds(): TripleMatchOdds {
  return {
    specific: {
      ways: 1,
      probability: 1 / TOTAL_OUTCOMES,
      oneInN: TOTAL_OUTCOMES,
    },
    any: {
      ways: 6,
      probability: 6 / TOTAL_OUTCOMES,
      oneInN: TOTAL_OUTCOMES / 6,
    },
  };
}

// ─────────────────────────────────────────────
// Sum Total Odds
// ─────────────────────────────────────────────

export interface SumTotalOdds {
  sum: number;
  ways: number;
  probability: number;
  oneInN: number;
}

export function getSumTotalOdds(): SumTotalOdds[] {
  const results: SumTotalOdds[] = [];
  for (let s = BINGO18_SUM_MIN; s <= BINGO18_SUM_MAX; s++) {
    const ways = SUM_WAYS.get(s) ?? 0;
    const probability = ways / TOTAL_OUTCOMES;
    results.push({
      sum: s,
      ways,
      probability,
      oneInN: probability > 0 ? 1 / probability : Infinity,
    });
  }
  return results;
}

// ─────────────────────────────────────────────
// Big/Small/Draw Odds
// ─────────────────────────────────────────────

export interface BigSmallDrawOdds {
  label: string;
  ways: number;
  probability: number;
  oneInN: number;
}

export function getBigSmallDrawOdds(): {
  small: BigSmallDrawOdds;
  draw: BigSmallDrawOdds;
  big: BigSmallDrawOdds;
} {
  let smallWays = 0;
  let drawWays = 0;
  let bigWays = 0;

  for (let s = BINGO18_SUM_MIN; s <= BINGO18_SUM_MAX; s++) {
    const w = SUM_WAYS.get(s) ?? 0;
    if (s <= BINGO18_SMALL_MAX) smallWays += w;
    else if (s >= BINGO18_BIG_MIN) bigWays += w;
    else drawWays += w;
  }

  const toOdds = (label: string, ways: number): BigSmallDrawOdds => ({
    label,
    ways,
    probability: ways / TOTAL_OUTCOMES,
    oneInN: ways > 0 ? TOTAL_OUTCOMES / ways : Infinity,
  });

  return {
    small: toOdds("Nhỏ (3-9)", smallWays),
    draw: toOdds("Hòa (10-11)", drawWays),
    big: toOdds("Lớn (12-18)", bigWays),
  };
}

// ─────────────────────────────────────────────
// Profit Analysis
// ─────────────────────────────────────────────

export interface TierProfitAnalysis {
  label: string;
  probability: number;
  oneInN: number;
  currentPrize: number;
  expectedPayout: number;
  payoutRatio: number;
  breakEvenPrize: number;
}

export interface PlayTypeProfitSummary {
  playType: string;
  unitPrice: number;
  tiers: TierProfitAnalysis[];
  totalExpectedPayout: number;
  totalPayoutRatio: number;
  grossMarginPerTicket: number;
  grossMarginPercent: number;
}

function buildSummary(playType: string, unitPrice: number, tiers: TierProfitAnalysis[]): PlayTypeProfitSummary {
  const totalExpectedPayout = tiers.reduce((s, t) => s + t.expectedPayout, 0);
  const totalPayoutRatio = unitPrice > 0 ? totalExpectedPayout / unitPrice : 0;
  return {
    playType,
    unitPrice,
    tiers,
    totalExpectedPayout,
    totalPayoutRatio,
    grossMarginPerTicket: unitPrice - totalExpectedPayout,
    grossMarginPercent: unitPrice > 0 ? ((unitPrice - totalExpectedPayout) / unitPrice) * 100 : 0,
  };
}

function tier(label: string, probability: number, prize: number, unitPrice: number): TierProfitAnalysis {
  const expectedPayout = probability * prize;
  return {
    label,
    probability,
    oneInN: probability > 0 ? 1 / probability : Infinity,
    currentPrize: prize,
    expectedPayout,
    payoutRatio: unitPrice > 0 ? expectedPayout / unitPrice : 0,
    breakEvenPrize: probability > 0 ? unitPrice / probability : Infinity,
  };
}

export function analyzeSingleNumProfitability(
  prizes: { match1: number; match2: number; match3: number },
  unitPrice: number,
): PlayTypeProfitSummary {
  const odds = getSingleNumOdds();
  const tiers = odds.map((o) => {
    const prize = o.matchCount === 1 ? prizes.match1 : o.matchCount === 2 ? prizes.match2 : prizes.match3;
    return tier(`Trùng ${o.matchCount}/3`, o.probability, prize, unitPrice);
  });
  return buildSummary("singleNum", unitPrice, tiers);
}

export function analyzeDoubleMatchProfitability(prizes: { win: number }, unitPrice: number): PlayTypeProfitSummary {
  const odds = getDoubleMatchOdds();
  return buildSummary("doubleMatch", unitPrice, [tier("Trùng ≥2/3", odds.probability, prizes.win, unitPrice)]);
}

export function analyzeTripleMatchProfitability(
  prizes: { specific: number; any: number },
  unitPrice: number,
): {
  specific: PlayTypeProfitSummary;
  any: PlayTypeProfitSummary;
} {
  const odds = getTripleMatchOdds();
  return {
    specific: buildSummary("tripleMatch.specific", unitPrice, [
      tier("Trùng 3/3 cụ thể", odds.specific.probability, prizes.specific, unitPrice),
    ]),
    any: buildSummary("tripleMatch.any", unitPrice, [
      tier("Trùng 3/3 bất kỳ", odds.any.probability, prizes.any, unitPrice),
    ]),
  };
}

export function analyzeSumTotalProfitability(prizes: Record<string, number>, unitPrice: number): PlayTypeProfitSummary {
  const odds = getSumTotalOdds();
  // Tra string key vì SumTotalPrizes dùng string key (MongoDB convention).
  const tiers = odds.map((o) => tier(`Tổng ${o.sum}`, o.probability, prizes[String(o.sum)] ?? 0, unitPrice));
  return buildSummary("sumTotal", unitPrice, tiers);
}

export function analyzeBigSmallDrawProfitability(
  prizes: { big: number; draw: number; small: number },
  unitPrice: number,
): PlayTypeProfitSummary {
  const odds = getBigSmallDrawOdds();
  const tiers = [
    tier("Nhỏ (3-9)", odds.small.probability, prizes.small, unitPrice),
    tier("Hòa (10-11)", odds.draw.probability, prizes.draw, unitPrice),
    tier("Lớn (12-18)", odds.big.probability, prizes.big, unitPrice),
  ];
  return buildSummary("bigSmallDraw", unitPrice, tiers);
}
