/**
 * Max 3D Pro – Odds & Profit Calculator
 *
 * Max 3D Pro: mỗi "line" = 1 cặp 2 bộ ba số. Giá 10,000 VND/line.
 * Kết quả quay: 20 bộ ba số (2 ĐB + 4 Nhất + 6 Nhì + 8 Ba).
 *
 * Tổng không gian mẫu cho 1 cặp ordered: S = 1,000 × 1,000 = 1,000,000
 */

import { PrizeTier } from "../entities/enums";
import type { PrizeAmounts } from "../entities/types";

const TOTAL_TRIPLETS = 1000;
const RESULT_SPECIAL = 2;
const RESULT_FIRST = 4;
const RESULT_SECOND = 6;
const RESULT_THIRD = 8;
const RESULT_TOTAL = 20;

export const PRO_TOTAL_OUTCOMES = TOTAL_TRIPLETS * TOTAL_TRIPLETS;

export interface ProTierOdds {
  tier: PrizeTier;
  label: string;
  ways: number;
  probability: number;
  oneInN: number;
  formula: string;
}

/**
 * Bảng xác suất Max 3D Pro (ordered pairs).
 *
 * ĐB:       first=special[0] AND second=special[1] → 1 way (ordered exact)
 * Phụ ĐB:   first=special[1] AND second=special[0] → 1 way (reversed)
 * Nhất:     cả 2 trong 4 bộ Nhất → 4×4 = 16 (trừ ĐB overlap = 0) → 4×3=12 ordered pairs (khác nhau) + 4 (giống) = 16
 * Nhì:      cả 2 trong 6 bộ Nhì → 6×6 = 36
 * Ba:       cả 2 trong 8 bộ Ba → 8×8 = 64
 * Tư:       cả 2 trong 20 bộ bất kỳ, trừ ĐB/phụĐB/Nhất/Nhì/Ba → 20×20 - 2 - 16 - 36 - 64 = 282
 * Năm:      chỉ 1 bộ trùng ĐB → 2 × (1000-20) × 2 = 3920 (first or second matches special)
 * Sáu:      chỉ 1 bộ trùng Nhất/Nhì/Ba → 2 × 18 × (1000-20) = 35280
 */
export function getProOddsTable(): ProTierOdds[] {
  const S = PRO_TOTAL_OUTCOMES;

  const waysSpecial = 1;
  const waysSpecialSub = 1;
  const waysFirst = RESULT_FIRST * RESULT_FIRST;
  const waysSecond = RESULT_SECOND * RESULT_SECOND;
  const waysThird = RESULT_THIRD * RESULT_THIRD;

  const waysBothInAny = RESULT_TOTAL * RESULT_TOTAL;
  const waysFourth =
    waysBothInAny -
    waysSpecial -
    waysSpecialSub -
    waysFirst -
    waysSecond -
    waysThird;

  const nonResult = TOTAL_TRIPLETS - RESULT_TOTAL;
  const waysOneSpecialOnly = 2 * RESULT_SPECIAL * nonResult;
  const waysOnlyNonSpecial = 2 * (RESULT_TOTAL - RESULT_SPECIAL) * nonResult;

  return [
    {
      tier: PrizeTier.Special,
      label: "Giải Đặc Biệt",
      ways: waysSpecial,
      probability: waysSpecial / S,
      oneInN: S / waysSpecial,
      formula: `1 (đúng thứ tự)`,
    },
    {
      tier: PrizeTier.SpecialSub,
      label: "Giải phụ Đặc Biệt",
      ways: waysSpecialSub,
      probability: waysSpecialSub / S,
      oneInN: S / waysSpecialSub,
      formula: `1 (ngược thứ tự)`,
    },
    {
      tier: PrizeTier.First,
      label: "Giải Nhất",
      ways: waysFirst,
      probability: waysFirst / S,
      oneInN: S / waysFirst,
      formula: `${RESULT_FIRST}² = ${waysFirst}`,
    },
    {
      tier: PrizeTier.Second,
      label: "Giải Nhì",
      ways: waysSecond,
      probability: waysSecond / S,
      oneInN: S / waysSecond,
      formula: `${RESULT_SECOND}² = ${waysSecond}`,
    },
    {
      tier: PrizeTier.Third,
      label: "Giải Ba",
      ways: waysThird,
      probability: waysThird / S,
      oneInN: S / waysThird,
      formula: `${RESULT_THIRD}² = ${waysThird}`,
    },
    {
      tier: PrizeTier.Fourth,
      label: "Giải Tư",
      ways: waysFourth,
      probability: waysFourth / S,
      oneInN: S / waysFourth,
      formula: `${RESULT_TOTAL}² - ĐB - phụĐB - Nhất² - Nhì² - Ba² = ${waysFourth}`,
    },
    {
      tier: PrizeTier.Fifth,
      label: "Giải Năm",
      ways: waysOneSpecialOnly,
      probability: waysOneSpecialOnly / S,
      oneInN: S / waysOneSpecialOnly,
      formula: `2 × ${RESULT_SPECIAL} × ${nonResult} = ${waysOneSpecialOnly}`,
    },
    {
      tier: PrizeTier.Sixth,
      label: "Giải Sáu",
      ways: waysOnlyNonSpecial,
      probability: waysOnlyNonSpecial / S,
      oneInN: S / waysOnlyNonSpecial,
      formula: `2 × ${RESULT_TOTAL - RESULT_SPECIAL} × ${nonResult} = ${waysOnlyNonSpecial}`,
    },
  ];
}

// ─────────────────────────────────────────────
// Profit Analysis
// ─────────────────────────────────────────────

export interface TierProfitAnalysis {
  tier: string;
  label: string;
  probability: number;
  oneInN: number;
  currentPrize: number;
  expectedPayout: number;
  payoutRatio: number;
  breakEvenPrize: number;
}

export interface ProfitSummary {
  unitPrice: number;
  mode: string;
  tiers: TierProfitAnalysis[];
  totalExpectedPayout: number;
  totalPayoutRatio: number;
  grossMarginPerLine: number;
  grossMarginPercent: number;
}

export function analyzeProProfitability(
  prizes: PrizeAmounts,
  unitPrice: number
): ProfitSummary {
  const oddsTable = getProOddsTable();

  const tiers: TierProfitAnalysis[] = oddsTable.map((odds) => {
    const currentPrize = prizes[odds.tier];
    const expectedPayout = odds.probability * currentPrize;
    return {
      tier: odds.tier,
      label: odds.label,
      probability: odds.probability,
      oneInN: odds.oneInN,
      currentPrize,
      expectedPayout,
      payoutRatio: unitPrice > 0 ? expectedPayout / unitPrice : 0,
      breakEvenPrize:
        odds.probability > 0 ? unitPrice / odds.probability : Infinity,
    };
  });

  const totalExpectedPayout = tiers.reduce((s, t) => s + t.expectedPayout, 0);
  const totalPayoutRatio = unitPrice > 0 ? totalExpectedPayout / unitPrice : 0;
  const grossMarginPerLine = unitPrice - totalExpectedPayout;

  return {
    unitPrice,
    mode: "max3dpro",
    tiers,
    totalExpectedPayout,
    totalPayoutRatio,
    grossMarginPerLine,
    grossMarginPercent:
      unitPrice > 0 ? (grossMarginPerLine / unitPrice) * 100 : 0,
  };
}
