/**
 * Max 3D – Odds & Profit Calculator
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * I. MÔ TẢ TRÒ CHƠI
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *   Max 3D – Xổ số tự chọn. Người chơi chọn bộ ba số (000-999).
 *   Mỗi chữ số chọn trong tập {0, 1, ..., 9}.
 *
 *   Giá vé: 10,000 VND / line.
 *   Lịch quay: Thứ 2, 4, 6 hàng tuần lúc 18h00.
 *
 *   Mỗi kỳ quay 20 bộ ba số:
 *   - 2 bộ giải Đặc Biệt
 *   - 4 bộ giải Nhất
 *   - 6 bộ giải Nhì
 *   - 8 bộ giải Ba
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * II. KHÔNG GIAN MẪU (Sample Space)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *   Mỗi bộ 3 chữ số, mỗi chữ số 0-9:
 *     Tổng giá trị: 10 × 10 × 10 = 1,000 bộ ba số.
 *
 *   Max 3D Cơ Bản (1 bộ, straight):
 *     S = 1,000 (so khớp chính xác)
 *
 *   Max 3D+ (2 bộ, straight):
 *     S = 1,000 × 1,000 = 1,000,000 (2 bộ ba số)
 *     (thực tế khác nhau: 1,000 × 999 = 999,000 nếu 2 bộ khác nhau)
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * III. XÁC SUẤT MAX 3D CƠ BẢN (Straight, 1 bộ ba số)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * ┌─────────────┬─────────┬───────────┬──────────────┐
 * │ Giải        │ Số bộ   │ XS trúng  │ 1 trong N    │
 * ├─────────────┼─────────┼───────────┼──────────────┤
 * │ Đặc Biệt   │ 2       │ 2/1000    │ 500          │
 * │ Nhất        │ 4       │ 4/1000    │ 250          │
 * │ Nhì         │ 6       │ 6/1000    │ 166.67       │
 * │ Ba          │ 8       │ 8/1000    │ 125          │
 * ├─────────────┼─────────┼───────────┼──────────────┤
 * │ Trúng bất kỳ│ 20      │ 20/1000   │ 50           │
 * │ Không trúng │ 980     │ 980/1000  │ ~1.02        │
 * └─────────────┴─────────┴───────────┴──────────────┘
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * IV. XÁC SUẤT MAX 3D+ (2 bộ ba số khác nhau)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * Giải ĐB:     trùng 2/2 bộ ĐB          → C(2,2)/C(1000,2) × ... (xem chi tiết bên dưới)
 * Giải Nhất:   trùng 2 trong 4 bộ Nhất   → C(4,2) cách chọn
 * Giải Nhì:    trùng 2 trong 6 bộ Nhì    → C(6,2) cách chọn
 * Giải Ba:     trùng 2 trong 8 bộ Ba     → C(8,2) cách chọn
 * Giải Tư:     trùng 2 bộ bất kỳ ĐB/Nhất/Nhì/Ba (cross-tier)
 * Giải Năm:    trùng 1 bộ ĐB
 * Giải Sáu:    trùng 1 bộ Nhất/Nhì/Ba
 *
 * Chú ý: Xác suất Plus phức tạp hơn do phụ thuộc vào 2 bộ số.
 * Dùng mô hình: 2 bộ ba số chọn từ 1000 giá trị.
 */

import { BasicPrizeTier, PlusPrizeTier } from "../entities/enums";
import type { BasicPrizeAmounts, Max3dPrizeConfig, PlusPrizeAmounts } from "../entities/types";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const TOTAL_TRIPLETS = 1000;
const RESULT_SPECIAL = 2;
const RESULT_FIRST = 4;
const RESULT_SECOND = 6;
const RESULT_THIRD = 8;
const RESULT_TOTAL = 20;

function C(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return Math.round(result);
}

// ─────────────────────────────────────────────
// Basic Odds (1 bộ ba số, straight)
// ─────────────────────────────────────────────

export const BASIC_TOTAL_OUTCOMES = TOTAL_TRIPLETS;

export interface BasicTierOdds {
  tier: BasicPrizeTier;
  label: string;
  resultCount: number;
  probability: number;
  oneInN: number;
}

export function getBasicOddsTable(): BasicTierOdds[] {
  const tiers: Array<{ tier: BasicPrizeTier; label: string; count: number }> = [
    {
      tier: BasicPrizeTier.Special,
      label: "Giải Đặc Biệt",
      count: RESULT_SPECIAL,
    },
    { tier: BasicPrizeTier.First, label: "Giải Nhất", count: RESULT_FIRST },
    { tier: BasicPrizeTier.Second, label: "Giải Nhì", count: RESULT_SECOND },
    { tier: BasicPrizeTier.Third, label: "Giải Ba", count: RESULT_THIRD },
  ];

  return tiers.map(({ tier, label, count }) => {
    const probability = count / BASIC_TOTAL_OUTCOMES;
    return {
      tier,
      label,
      resultCount: count,
      probability,
      oneInN: 1 / probability,
    };
  });
}

// ─────────────────────────────────────────────
// Combo Odds
// ─────────────────────────────────────────────

/**
 * Combo3 (2 chữ số giống, 3 hoán vị):
 * Xác suất trúng 1 giải = 3 × (resultCount / 1000)
 * nhưng giải thưởng thấp hơn straight.
 *
 * Combo6 (3 chữ số khác nhau, 6 hoán vị):
 * Xác suất trúng 1 giải = 6 × (resultCount / 1000)
 * nhưng giải thưởng thấp hơn nữa.
 */
export function getCombo3OddsTable(): BasicTierOdds[] {
  return getBasicOddsTable().map((odds) => ({
    ...odds,
    probability: Math.min(odds.probability * 3, 1),
    oneInN: 1 / Math.min(odds.probability * 3, 1),
  }));
}

export function getCombo6OddsTable(): BasicTierOdds[] {
  return getBasicOddsTable().map((odds) => ({
    ...odds,
    probability: Math.min(odds.probability * 6, 1),
    oneInN: 1 / Math.min(odds.probability * 6, 1),
  }));
}

// ─────────────────────────────────────────────
// Plus Odds (2 bộ ba số)
// ─────────────────────────────────────────────

/**
 * Tổng không gian mẫu cho Max 3D+ (2 bộ ba số, có thể giống nhau):
 * S = 1,000 × 1,000 = 1,000,000
 */
export const PLUS_TOTAL_OUTCOMES = TOTAL_TRIPLETS * TOTAL_TRIPLETS;

export interface PlusTierOdds {
  tier: PlusPrizeTier;
  label: string;
  ways: number;
  probability: number;
  oneInN: number;
  formula: string;
}

/**
 * Tính xác suất cho Max 3D+.
 *
 * Mô hình: chọn 2 bộ ba số (t1, t2) từ 000-999.
 * S = 1,000,000 (ordered pairs, có thể trùng).
 *
 * Giải ĐB:     cả 2 bộ đều trùng trong 2 bộ ĐB → 2×2 = 4 ways (vì 2 bộ ĐB, mỗi bộ match 1)
 *              Thực tế: t1 ∈ {2 bộ ĐB} AND t2 ∈ {2 bộ ĐB} → 2 × 2 = 4 ordered pairs
 *              Nhưng nếu 2 bộ ĐB khác nhau và t1≠t2: 2×1 = 2 ordered pairs
 *              Trường hợp đơn giản: coi 2 bộ ĐB khác nhau, cần t1 match + t2 match
 *              → P(2,2) = 2 × 1 = 2 (permutations) → 2 ways for ordered pairs where both match different ĐB
 *              + 2 ways for t1=t2 matching same ĐB → total 4 ways
 *
 * Giải Nhất:   cả 2 trùng trong 4 bộ Nhất → 4 × 4 = 16 ways
 * Giải Nhì:    cả 2 trùng trong 6 bộ Nhì → 6 × 6 = 36 ways
 * Giải Ba:     cả 2 trùng trong 8 bộ Ba → 8 × 8 = 64 ways
 * Giải Tư:     cả 2 trùng bất kỳ trong 20 bộ, trừ các giải trên → 20×20 - ĐB - Nhất - Nhì - Ba
 * Giải Năm:    chỉ 1 trong 2 trùng bộ ĐB → ...
 * Giải Sáu:    chỉ 1 trong 2 trùng Nhất/Nhì/Ba → ...
 */
export function getPlusOddsTable(): PlusTierOdds[] {
  const S = PLUS_TOTAL_OUTCOMES;

  const waysSpecial = RESULT_SPECIAL * RESULT_SPECIAL;
  const waysFirst = RESULT_FIRST * RESULT_FIRST;
  const waysSecond = RESULT_SECOND * RESULT_SECOND;
  const waysThird = RESULT_THIRD * RESULT_THIRD;

  const waysBothInAny = RESULT_TOTAL * RESULT_TOTAL;
  const waysFourth = waysBothInAny - waysSpecial - waysFirst - waysSecond - waysThird;

  const waysOneSpecialOnly = 2 * RESULT_SPECIAL * (TOTAL_TRIPLETS - RESULT_TOTAL);

  const waysOnlyNonSpecial = 2 * (RESULT_TOTAL - RESULT_SPECIAL) * (TOTAL_TRIPLETS - RESULT_TOTAL);

  const waysSixth = waysOnlyNonSpecial;

  return [
    {
      tier: PlusPrizeTier.Special,
      label: "Giải Đặc Biệt",
      ways: waysSpecial,
      probability: waysSpecial / S,
      oneInN: S / waysSpecial,
      formula: `${RESULT_SPECIAL}² = ${waysSpecial}`,
    },
    {
      tier: PlusPrizeTier.First,
      label: "Giải Nhất",
      ways: waysFirst,
      probability: waysFirst / S,
      oneInN: S / waysFirst,
      formula: `${RESULT_FIRST}² = ${waysFirst}`,
    },
    {
      tier: PlusPrizeTier.Second,
      label: "Giải Nhì",
      ways: waysSecond,
      probability: waysSecond / S,
      oneInN: S / waysSecond,
      formula: `${RESULT_SECOND}² = ${waysSecond}`,
    },
    {
      tier: PlusPrizeTier.Third,
      label: "Giải Ba",
      ways: waysThird,
      probability: waysThird / S,
      oneInN: S / waysThird,
      formula: `${RESULT_THIRD}² = ${waysThird}`,
    },
    {
      tier: PlusPrizeTier.Fourth,
      label: "Giải Tư",
      ways: waysFourth,
      probability: waysFourth / S,
      oneInN: S / waysFourth,
      formula: `${RESULT_TOTAL}² - ĐB² - Nhất² - Nhì² - Ba² = ${waysFourth}`,
    },
    {
      tier: PlusPrizeTier.Fifth,
      label: "Giải Năm",
      ways: waysOneSpecialOnly,
      probability: waysOneSpecialOnly / S,
      oneInN: S / waysOneSpecialOnly,
      formula: `2 × ${RESULT_SPECIAL} × (${TOTAL_TRIPLETS} - ${RESULT_TOTAL}) = ${waysOneSpecialOnly}`,
    },
    {
      tier: PlusPrizeTier.Sixth,
      label: "Giải Sáu",
      ways: waysSixth,
      probability: waysSixth / S,
      oneInN: S / waysSixth,
      formula: `2 × (${RESULT_TOTAL} - ${RESULT_SPECIAL}) × (${TOTAL_TRIPLETS} - ${RESULT_TOTAL}) = ${waysSixth}`,
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

export function analyzeBasicStraightProfitability(prizes: BasicPrizeAmounts, unitPrice: number): ProfitSummary {
  const oddsTable = getBasicOddsTable();

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
      breakEvenPrize: odds.probability > 0 ? unitPrice / odds.probability : Infinity,
    };
  });

  const totalExpectedPayout = tiers.reduce((s, t) => s + t.expectedPayout, 0);
  const totalPayoutRatio = unitPrice > 0 ? totalExpectedPayout / unitPrice : 0;
  const grossMarginPerLine = unitPrice - totalExpectedPayout;

  return {
    unitPrice,
    mode: "basic_straight",
    tiers,
    totalExpectedPayout,
    totalPayoutRatio,
    grossMarginPerLine,
    grossMarginPercent: unitPrice > 0 ? (grossMarginPerLine / unitPrice) * 100 : 0,
  };
}

export function analyzePlusProfitability(prizes: PlusPrizeAmounts, unitPrice: number): ProfitSummary {
  const oddsTable = getPlusOddsTable();

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
      breakEvenPrize: odds.probability > 0 ? unitPrice / odds.probability : Infinity,
    };
  });

  const totalExpectedPayout = tiers.reduce((s, t) => s + t.expectedPayout, 0);
  const totalPayoutRatio = unitPrice > 0 ? totalExpectedPayout / unitPrice : 0;
  const grossMarginPerLine = unitPrice - totalExpectedPayout;

  return {
    unitPrice,
    mode: "plus",
    tiers,
    totalExpectedPayout,
    totalPayoutRatio,
    grossMarginPerLine,
    grossMarginPercent: unitPrice > 0 ? (grossMarginPerLine / unitPrice) * 100 : 0,
  };
}
