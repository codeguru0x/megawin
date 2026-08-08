/**
 * Mega 6/45 – Odds & Profit Calculator
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * I. MÔ TẢ TRÒ CHƠI
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *   Mega 6/45 quay 6 số từ tập {1, 2, ..., 45}. Không có số đặc biệt.
 *   Giá vé: 10,000 VND / line.
 *   Lịch quay: 3 lần/tuần – Thứ 4, Thứ 6, Chủ nhật lúc 18:00.
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * II. KHÔNG GIAN MẪU (Sample Space)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *   Tổng cách chọn 6 số từ 45:
 *     S = C(45,6) = 45! / (6! × 39!)
 *       = (45 × 44 × 43 × 42 × 41 × 40) / (6 × 5 × 4 × 3 × 2 × 1)
 *       = 5,864,443,200 / 720
 *       = 8,145,060
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * III. CÔNG THỨC XÁC SUẤT TỪNG GIẢI
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *   Trùng k trong 6 số: MainWays(k) = C(6,k) × C(39, 6-k)
 *
 * ┌────────────────┬──────┬──────────────────────────┬─────────────────┬──────────────────┐
 * │ Giải           │ Match│ Cách tính                │ Favorable       │ Xác suất         │
 * ├────────────────┼──────┼──────────────────────────┼─────────────────┼──────────────────┤
 * │ Đặc biệt (JP) │ 6/6  │ C(6,6)×C(39,0)           │ 1               │ 1/8,145,060      │
 * │ Giải Nhất      │ 5/6  │ C(6,5)×C(39,1)           │ 6×39 = 234      │ 1/34,808         │
 * │ Giải Nhì       │ 4/6  │ C(6,4)×C(39,2)           │ 15×741 = 11,115 │ 1/732.7          │
 * │ Giải Ba        │ 3/6  │ C(6,3)×C(39,3)           │ 20×9,139=182,780│ 1/44.6           │
 * │ Không trúng    │ 0-2  │                          │ 7,950,930       │ ≈ 97.62%         │
 * └────────────────┴──────┴──────────────────────────┴─────────────────┴──────────────────┘
 *
 *   Kiểm tra: 1 + 234 + 11,115 + 182,780 + 7,950,930 = 8,145,060 ✓
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * IV. CƠ CẤU GIẢI THƯỞNG MẶC ĐỊNH
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * ┌────────────────┬──────────────────────┐
 * │ Giải           │ Giá trị thưởng       │
 * ├────────────────┼──────────────────────┤
 * │ Đặc biệt (JP) │ Tích luỹ (min 12 tỷ) │
 * │ Giải Nhất      │ 10,000,000 VND       │
 * │ Giải Nhì       │ 300,000 VND          │
 * │ Giải Ba        │ 30,000 VND           │
 * └────────────────┴──────────────────────┘
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * V. PHÂN TÍCH LỢI NHUẬN
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * ┌─────────────┬───────────────┬───────────────┬─────────────────┬──────────────┐
 * │ Giải        │ Xác suất      │ Giải thưởng   │ Expected Payout │ Payout Ratio │
 * ├─────────────┼───────────────┼───────────────┼─────────────────┼──────────────┤
 * │ Giải Nhất   │ 1/34,808      │ 10,000,000    │ 287.30 VND      │ 2.87%        │
 * │ Giải Nhì    │ 1/732.7       │ 300,000       │ 409.50 VND      │ 4.10%        │
 * │ Giải Ba     │ 1/44.6        │ 30,000        │ 672.71 VND      │ 6.73%        │
 * ├─────────────┼───────────────┼───────────────┼─────────────────┼──────────────┤
 * │ TỔNG        │               │               │ 1,369.51 VND    │ 13.70%       │
 * └─────────────┴───────────────┴───────────────┴─────────────────┴──────────────┘
 *
 *   Gross Margin / line = 10,000 - 1,369.51 = 8,630.49 VND (86.30%)
 */

import { PrizeTier } from "../entities/enums";
import { MEGA645_NUMBER_MAX, MEGA645_NUMBER_COUNT, type PrizeAmounts } from "../entities/types";
import { combination } from "./play-types";

const NUMBER_POOL = MEGA645_NUMBER_MAX; // 45
const NUMBER_PICK = MEGA645_NUMBER_COUNT; // 6

/**
 * Tổng không gian mẫu cho 1 line standard.
 * = C(45,6) = 8,145,060
 */
export const TOTAL_OUTCOMES = combination(NUMBER_POOL, NUMBER_PICK);

/**
 * Số cách trùng đúng k số chính từ 6 số trúng trong pool 45.
 * = C(6,k) × C(39, 6-k)
 */
function matchWays(k: number): number {
  return combination(NUMBER_PICK, k) * combination(NUMBER_POOL - NUMBER_PICK, NUMBER_PICK - k);
}

export interface TierOdds {
  tier: PrizeTier;
  label: string;
  ways: number;
  probability: number;
  oneInN: number;
}

/**
 * C(6,6)×C(39,0) = 1
 * C(6,5)×C(39,1) = 6×39 = 234
 * C(6,4)×C(39,2) = 15×741 = 11,115
 * C(6,3)×C(39,3) = 20×9,139 = 182,780
 *
 * Kiểm tra: 1 + 234 + 11,115 + 182,780 = 194,130
 *           8,145,060 - 194,130 = 7,950,930 (không trúng)
 *           1 + 234 + 11,115 + 182,780 + 7,950,930 = 8,145,060 ✓
 */
function computeTierWays(): Map<PrizeTier, number> {
  const ways = new Map<PrizeTier, number>();

  ways.set(PrizeTier.Jackpot, matchWays(6)); // 1
  ways.set(PrizeTier.Tier1, matchWays(5)); // 234
  ways.set(PrizeTier.Tier2, matchWays(4)); // 11,115
  ways.set(PrizeTier.Tier3, matchWays(3)); // 182,780

  return ways;
}

const TIER_WAYS = computeTierWays();

const TIER_LABELS: Record<string, string> = {
  [PrizeTier.Jackpot]: "Giải Đặc Biệt",
  [PrizeTier.Tier1]: "Giải Nhất",
  [PrizeTier.Tier2]: "Giải Nhì",
  [PrizeTier.Tier3]: "Giải Ba",
};

export function getOddsTable(): TierOdds[] {
  const tiers: PrizeTier[] = [PrizeTier.Jackpot, PrizeTier.Tier1, PrizeTier.Tier2, PrizeTier.Tier3];

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

export interface TierProfitAnalysis {
  tier: PrizeTier;
  probability: number;
  oneInN: number;
  currentPrize: number;
  expectedPayout: number;
  payoutRatio: number;
  breakEvenPrize: number;
}

export interface ProfitSummary {
  unitPrice: number;
  tiers: TierProfitAnalysis[];
  totalExpectedPayout: number;
  totalPayoutRatio: number;
  grossMarginPerLine: number;
  grossMarginPercent: number;
}

const FIXED_TIERS: PrizeTier[] = [PrizeTier.Tier1, PrizeTier.Tier2, PrizeTier.Tier3];

export function analyzeProfitability(prizes: PrizeAmounts, unitPrice: number): ProfitSummary {
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
  const grossMarginPercent = unitPrice > 0 ? (grossMarginPerLine / unitPrice) * 100 : 0;

  return {
    unitPrice,
    tiers,
    totalExpectedPayout,
    totalPayoutRatio,
    grossMarginPerLine,
    grossMarginPercent,
  };
}
