/**
 * Lotto 5/35 – Odds & Profit Calculator
 *
 * Tính toán xác suất trúng thưởng và phân tích lợi nhuận
 * dựa trên quy tắc game Lotto 5/35.
 *
 * Không gian mẫu (standard play, 1 line):
 *   - 5 số chính từ pool 35 → C(35,5) = 324,632 cách
 *   - 1 số đặc biệt từ pool 12 → 12 cách
 *   - Tổng = C(35,5) × 12 = 3,895,584
 *
 * Bảng xác suất (1 line):
 * ┌─────────────┬──────────┬─────────┬────────────────────────────────────┐
 * │ Tier        │ Main     │ Special │ Odds (1 in N)                      │
 * ├─────────────┼──────────┼─────────┼────────────────────────────────────┤
 * │ jackpot     │ 5 of 5   │ yes     │ C(35,5)×12 = 3,895,584            │
 * │ tier1       │ 5 of 5   │ no      │ C(35,5)×12/11 = 354,144           │
 * │ tier2       │ 4 of 5   │ yes     │ C(5,4)×C(30,1)×1/12 = 25,970.56  │
 * │ tier3       │ 4 of 5   │ no      │ C(5,4)×C(30,1)×11/12 = 2,360.96  │
 * │ tier4       │ 3 of 5   │ yes     │ see below                         │
 * │ tier5       │ 3 of 5   │ no      │ see below                         │
 * │ consolation │ ≤2 main  │ yes     │ see below                         │
 * └─────────────┴──────────┴─────────┴────────────────────────────────────┘
 */

import { PrizeTier } from "../entities/enums";
import {
  LOTTO535_MAIN_MAX,
  LOTTO535_MAIN_COUNT,
  LOTTO535_SPECIAL_MAX,
  type PrizeAmounts,
} from "../entities/types";
import { combination } from "./play-types";

const MAIN_POOL = LOTTO535_MAIN_MAX; // 35
const MAIN_PICK = LOTTO535_MAIN_COUNT; // 5
const SPECIAL_POOL = LOTTO535_SPECIAL_MAX; // 12

/**
 * Tổng không gian mẫu cho 1 line standard.
 * = C(35,5) × 12 = 3,895,584
 */
export const TOTAL_OUTCOMES = combination(MAIN_POOL, MAIN_PICK) * SPECIAL_POOL;

/**
 * Số cách trùng đúng `k` số chính từ 5 số trúng trong pool 35.
 * = C(5,k) × C(30, 5-k)
 */
function mainMatchWays(k: number): number {
  return (
    combination(MAIN_PICK, k) *
    combination(MAIN_POOL - MAIN_PICK, MAIN_PICK - k)
  );
}

/** Thông tin xác suất cho 1 tier. */
export interface TierOdds {
  tier: PrizeTier;
  label: string;
  /** Số cách trúng (favorable outcomes). */
  ways: number;
  /** Xác suất P = ways / TOTAL_OUTCOMES. */
  probability: number;
  /** 1 in N (inverse of probability). */
  oneInN: number;
}

/**
 * Tính số cách trúng (favorable outcomes) cho từng tier.
 *
 * Jackpot: 5 main + special matched → C(5,5)×C(30,0) × 1 = 1
 * Tier1:   5 main + special NOT matched → 1 × 11 = 11
 * Tier2:   4 main + special matched → C(5,4)×C(30,1) × 1 = 150
 * Tier3:   4 main + special NOT matched → 150 × 11 = 1,650
 * Tier4:   3 main + special matched → C(5,3)×C(30,2) × 1 = 4,350
 * Tier5:   3 main + special NOT matched → 4,350 × 11 = 47,850
 * Consolation: (0,1,2 main) + special matched
 *   = [C(5,0)×C(30,5) + C(5,1)×C(30,4) + C(5,2)×C(30,3)] × 1
 *   = [142,506 + 137,025 + 40,600] × 1 = 320,131
 */
function computeTierWays(): Map<PrizeTier, number> {
  const ways = new Map<PrizeTier, number>();

  const main5 = mainMatchWays(5); // C(5,5)×C(30,0) = 1
  const main4 = mainMatchWays(4); // C(5,4)×C(30,1) = 150
  const main3 = mainMatchWays(3); // C(5,3)×C(30,2) = 4,350
  const main2 = mainMatchWays(2); // C(5,2)×C(30,3) = 40,600
  const main1 = mainMatchWays(1); // C(5,1)×C(30,4) = 137,025
  const main0 = mainMatchWays(0); // C(5,0)×C(30,5) = 142,506

  const specialYes = 1;
  const specialNo = SPECIAL_POOL - 1; // 11

  ways.set(PrizeTier.Jackpot, main5 * specialYes); // 1
  ways.set(PrizeTier.Tier1, main5 * specialNo); // 11
  ways.set(PrizeTier.Tier2, main4 * specialYes); // 150
  ways.set(PrizeTier.Tier3, main4 * specialNo); // 1,650
  ways.set(PrizeTier.Tier4, main3 * specialYes); // 4,350
  ways.set(PrizeTier.Tier5, main3 * specialNo); // 47,850
  ways.set(PrizeTier.Consolation, (main0 + main1 + main2) * specialYes); // 320,131

  return ways;
}

const TIER_WAYS = computeTierWays();

const TIER_LABELS: Record<string, string> = {
  [PrizeTier.Jackpot]: "Giải Độc Đắc",
  [PrizeTier.Tier1]: "Giải Nhất",
  [PrizeTier.Tier2]: "Giải Nhì",
  [PrizeTier.Tier3]: "Giải Ba",
  [PrizeTier.Tier4]: "Giải Tư",
  [PrizeTier.Tier5]: "Giải Năm",
  [PrizeTier.Consolation]: "Giải Khuyến Khích",
};

/**
 * Bảng xác suất cho tất cả các tier.
 * Kết quả đã tính sẵn, immutable.
 */
export function getOddsTable(): TierOdds[] {
  const tiers: PrizeTier[] = [
    PrizeTier.Jackpot,
    PrizeTier.Tier1,
    PrizeTier.Tier2,
    PrizeTier.Tier3,
    PrizeTier.Tier4,
    PrizeTier.Tier5,
    PrizeTier.Consolation,
  ];

  return tiers.map((tier) => {
    const ways = TIER_WAYS.get(tier)!;
    const probability = ways / TOTAL_OUTCOMES;
    return {
      tier,
      label: TIER_LABELS[tier] ?? tier,
      ways,
      probability,
      oneInN: 1 / probability,
    };
  });
}

// ─────────────────────────────────────────────
// Profit Analysis
// ─────────────────────────────────────────────

/** Phân tích lợi nhuận cho 1 tier (không bao gồm Jackpot). */
export interface TierProfitAnalysis {
  tier: PrizeTier;
  /** Xác suất trúng. */
  probability: number;
  /** 1 in N. */
  oneInN: number;
  /** Giá trị giải thưởng hiện tại (VND). */
  currentPrize: number;
  /**
   * Expected payout per line (VND) = probability × prize.
   * Đây là chi phí trả thưởng kỳ vọng cho mỗi line bán ra cho tier này.
   */
  expectedPayout: number;
  /**
   * Tỷ lệ trả thưởng (payout ratio) = expectedPayout / unitPrice.
   * > 1 nghĩa là lỗ (trả nhiều hơn thu).
   */
  payoutRatio: number;
  /**
   * Giá trị giải thưởng tối đa để hoà vốn cho tier này = unitPrice / probability.
   * Nếu prize > breakEvenPrize → tier này lỗ về kỳ vọng.
   */
  breakEvenPrize: number;
}

/** Tổng hợp lợi nhuận toàn bộ bảng giải. */
export interface ProfitSummary {
  /** Giá 1 line (VND). */
  unitPrice: number;
  /** Phân tích từng tier (không bao gồm Jackpot). */
  tiers: TierProfitAnalysis[];
  /** Tổng expected payout / line cho tất cả fixed tiers (VND). */
  totalExpectedPayout: number;
  /**
   * Tổng payout ratio = totalExpectedPayout / unitPrice.
   * Phần còn lại (1 - payoutRatio) là gross margin trước Jackpot contribution.
   */
  totalPayoutRatio: number;
  /** Gross margin per line = unitPrice - totalExpectedPayout (VND). */
  grossMarginPerLine: number;
  /** Gross margin percentage = grossMarginPerLine / unitPrice × 100. */
  grossMarginPercent: number;
}

/** Các tier giải cố định (không bao gồm Jackpot vì tích luỹ). */
const FIXED_TIERS: PrizeTier[] = [
  PrizeTier.Tier1,
  PrizeTier.Tier2,
  PrizeTier.Tier3,
  PrizeTier.Tier4,
  PrizeTier.Tier5,
  PrizeTier.Consolation,
];

/**
 * Tính phân tích lợi nhuận cho bảng giải thưởng cố định.
 *
 * @param prizes - Giá trị giải thưởng hiện tại (từ config)
 * @param unitPrice - Giá 1 line (VND)
 * @returns Phân tích lợi nhuận chi tiết
 *
 * @example
 * ```ts
 * const analysis = analyzeProfitability(
 *   { tier1: 10_000_000, tier2: 5_000_000, tier3: 500_000, tier4: 100_000, tier5: 30_000, consolation: 10_000 },
 *   10_000,
 * );
 * console.log(analysis.grossMarginPercent); // ~82.66%
 * ```
 */
export function analyzeProfitability(
  prizes: PrizeAmounts,
  unitPrice: number
): ProfitSummary {
  const amounts = prizes as unknown as Record<string, number>;

  const tiers: TierProfitAnalysis[] = FIXED_TIERS.map((tier) => {
    const ways = TIER_WAYS.get(tier)!;
    const probability = ways / TOTAL_OUTCOMES;
    const currentPrize = amounts[tier] ?? 0;
    const expectedPayout = probability * currentPrize;
    const payoutRatio = unitPrice > 0 ? expectedPayout / unitPrice : 0;
    const breakEvenPrize = probability > 0 ? unitPrice / probability : Infinity;

    return {
      tier,
      probability,
      oneInN: 1 / probability,
      currentPrize,
      expectedPayout,
      payoutRatio,
      breakEvenPrize,
    };
  });

  const totalExpectedPayout = tiers.reduce((s, t) => s + t.expectedPayout, 0);
  const totalPayoutRatio = unitPrice > 0 ? totalExpectedPayout / unitPrice : 0;
  const grossMarginPerLine = unitPrice - totalExpectedPayout;
  const grossMarginPercent =
    unitPrice > 0 ? (grossMarginPerLine / unitPrice) * 100 : 0;

  return {
    unitPrice,
    tiers,
    totalExpectedPayout,
    totalPayoutRatio,
    grossMarginPerLine,
    grossMarginPercent,
  };
}
