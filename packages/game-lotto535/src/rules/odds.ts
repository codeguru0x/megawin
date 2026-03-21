/**
 * Lotto 5/35 – Odds & Profit Calculator
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * I. MÔ TẢ TRÒ CHƠI
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *   Lotto 5/35 quay 5 số chính từ tập {1, 2, ..., 35} và 1 số đặc biệt
 *   từ tập riêng {1, 2, ..., 12}. Người chơi chọn 5 số chính + 1 số đặc biệt.
 *
 *   Giá vé: 10,000 VND / line (Standard play).
 *   Lịch quay: 2 kỳ/ngày — 13h00 và 21h00, mỗi ngày trong tuần.
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * II. KHÔNG GIAN MẪU (Sample Space)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *   Tổng cách chọn 5 số từ 35 số chính:
 *     C(35,5) = 35! / (5! × 30!)
 *            = (35 × 34 × 33 × 32 × 31) / (5 × 4 × 3 × 2 × 1)
 *            = 38,955,840 / 120
 *            = 324,632
 *
 *   Số đặc biệt: 1 trong 12 → 12 cách
 *
 *   Tổng không gian mẫu (1 line):
 *     S = C(35,5) × 12 = 324,632 × 12 = 3,895,584
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * III. CÔNG THỨC XÁC SUẤT TỪNG GIẢI
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *   Công thức chung: trùng k trong 5 số chính + special (yes/no)
 *     MainWays(k) = C(5, k) × C(30, 5-k)
 *     Ways(tier)  = MainWays(k) × SpecialFactor
 *     P(tier)     = Ways(tier) / S
 *
 *   Trong đó SpecialFactor:
 *     - Special matched: × 1 (1 cách trùng trong 12)
 *     - Special NOT matched: × 11 (11 cách không trùng trong 12)
 *
 * ┌────────────────┬──────┬─────────┬──────────────────────────┬─────────────────┬──────────────────┐
 * │ Giải           │ Main │ Special │ Cách tính                │ Favorable       │ Xác suất         │
 * │                │ match│         │                          │ outcomes        │ 1 trong N        │
 * ├────────────────┼──────┼─────────┼──────────────────────────┼─────────────────┼──────────────────┤
 * │ Jackpot        │ 5/5  │ ✓ yes   │ C(5,5)×C(30,0) × 1      │ 1 × 1 = 1       │ 1/3,895,584      │
 * │                │      │         │                          │                 │ ≈ 2.567 × 10⁻⁷   │
 * ├────────────────┼──────┼─────────┼──────────────────────────┼─────────────────┼──────────────────┤
 * │ Giải Nhất      │ 5/5  │ ✗ no    │ C(5,5)×C(30,0) × 11     │ 1 × 11 = 11     │ 1/354,144        │
 * │ (Tier 1)       │      │         │                          │                 │ ≈ 2.824 × 10⁻⁶   │
 * ├────────────────┼──────┼─────────┼──────────────────────────┼─────────────────┼──────────────────┤
 * │ Giải Nhì       │ 4/5  │ ✓ yes   │ C(5,4)×C(30,1) × 1      │ 5×30 × 1 = 150  │ 1/25,970.6       │
 * │ (Tier 2)       │      │         │                          │                 │ ≈ 3.851 × 10⁻⁵   │
 * ├────────────────┼──────┼─────────┼──────────────────────────┼─────────────────┼──────────────────┤
 * │ Giải Ba        │ 4/5  │ ✗ no    │ C(5,4)×C(30,1) × 11     │ 150 × 11 = 1,650│ 1/2,361.0        │
 * │ (Tier 3)       │      │         │                          │                 │ ≈ 4.236 × 10⁻⁴   │
 * ├────────────────┼──────┼─────────┼──────────────────────────┼─────────────────┼──────────────────┤
 * │ Giải Tư        │ 3/5  │ ✓ yes   │ C(5,3)×C(30,2) × 1      │ 10×435 × 1      │ 1/895.5          │
 * │ (Tier 4)       │      │         │                          │ = 4,350         │ ≈ 1.117 × 10⁻³   │
 * ├────────────────┼──────┼─────────┼──────────────────────────┼─────────────────┼──────────────────┤
 * │ Giải Năm       │ 3/5  │ ✗ no    │ C(5,3)×C(30,2) × 11     │ 4,350 × 11      │ 1/81.4           │
 * │ (Tier 5)       │      │         │                          │ = 47,850        │ ≈ 1.228 × 10⁻²   │
 * ├────────────────┼──────┼─────────┼──────────────────────────┼─────────────────┼──────────────────┤
 * │ Khuyến Khích   │ ≤2/5 │ ✓ yes   │ [C(5,0)×C(30,5)         │ 320,131         │ 1/12.2           │
 * │ (Consolation)  │      │         │  +C(5,1)×C(30,4)        │                 │ ≈ 8.218 × 10⁻²   │
 * │                │      │         │  +C(5,2)×C(30,3)] × 1   │                 │                  │
 * │                │      │         │ = (142,506 + 137,025     │                 │                  │
 * │                │      │         │  + 40,600) × 1           │                 │                  │
 * ├────────────────┼──────┼─────────┼──────────────────────────┼─────────────────┼──────────────────┤
 * │ Không trúng    │      │         │                          │ 3,521,441       │ ≈ 90.40%          │
 * └────────────────┴──────┴─────────┴──────────────────────────┴─────────────────┴──────────────────┘
 *
 *   Kiểm tra: 1 + 11 + 150 + 1,650 + 4,350 + 47,850 + 320,131 + 3,521,441 = 3,895,584 ✓
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * IV. CƠ CẤU GIẢI THƯỞNG MẶC ĐỊNH
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * ┌────────────────┬──────────────────────┐
 * │ Giải           │ Giá trị thưởng       │
 * ├────────────────┼──────────────────────┤
 * │ Jackpot        │ Tích luỹ (seed 5 tỷ) │
 * │ Giải Nhất      │ 10,000,000 VND       │
 * │ Giải Nhì       │ 5,000,000 VND        │
 * │ Giải Ba        │ 500,000 VND          │
 * │ Giải Tư        │ 100,000 VND          │
 * │ Giải Năm       │ 30,000 VND           │
 * │ Khuyến Khích   │ 10,000 VND           │
 * └────────────────┴──────────────────────┘
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * V. PHÂN TÍCH LỢI NHUẬN (chỉ tính các giải cố định, không gồm Jackpot)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *   Công thức cho mỗi tier:
 *     Expected Payout / line  = P(tier) × Prize(tier)
 *     Payout Ratio            = Expected Payout / Unit Price
 *     Break-even Prize        = Unit Price / P(tier)
 *       (giá trị giải tối đa để tier này không lỗ)
 *
 *   Với giá trị mặc định (unit price = 10,000 VND):
 *
 * ┌─────────────┬───────────────┬───────────────┬─────────────────┬──────────────┬──────────────────┐
 * │ Giải        │ Xác suất      │ Giải thưởng   │ Expected Payout │ Payout Ratio │ Break-even Prize │
 * ├─────────────┼───────────────┼───────────────┼─────────────────┼──────────────┼──────────────────┤
 * │ Giải Nhất   │ 1/354,144     │ 10,000,000    │ 28.24 VND       │ 0.28%        │ 3,541,440,000    │
 * │ Giải Nhì    │ 1/25,970.6    │ 5,000,000     │ 192.53 VND      │ 1.93%        │ 259,706,000      │
 * │ Giải Ba     │ 1/2,361.0     │ 500,000       │ 211.78 VND      │ 2.12%        │ 23,610,000       │
 * │ Giải Tư     │ 1/895.5       │ 100,000       │ 111.67 VND      │ 1.12%        │ 8,955,000        │
 * │ Giải Năm    │ 1/81.4        │ 30,000        │ 368.56 VND      │ 3.69%        │ 814,000          │
 * │ Khuyến Khích│ 1/12.2        │ 10,000        │ 821.77 VND      │ 8.22%        │ 122,000          │
 * ├─────────────┼───────────────┼───────────────┼─────────────────┼──────────────┼──────────────────┤
 * │ TỔNG        │               │               │ 1,734.55 VND    │ 17.35%       │                  │
 * └─────────────┴───────────────┴───────────────┴─────────────────┴──────────────┴──────────────────┘
 *
 *   Gross Margin / line = 10,000 - 1,734.55 = 8,265.45 VND (82.65%)
 *   (Phần margin này dùng cho: Commission + Company Take + Jackpot tích luỹ)
 *
 *   Phân bổ doanh thu mỗi line (mặc định):
 *     100% Revenue = 10,000 VND
 *     ├── 20% Hoa hồng đại lý    = 2,000 VND
 *     ├── 15% Công ty thu về      = 1,500 VND
 *     ├── ~17.35% Giải cố định    ≈ 1,735 VND
 *     └── ~47.65% Tích luỹ JP     ≈ 4,765 VND
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * VI. CÁC LOẠI VÉ (Play Types) VÀ GIÁ VÉ
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * ┌───────────────┬────────────┬────────────┬─────────────────┬───────────────────┐
 * │ Loại vé       │ Main       │ Special    │ Lines           │ Giá vé / draw     │
 * ├───────────────┼────────────┼────────────┼─────────────────┼───────────────────┤
 * │ Standard      │ 5 số       │ 1 số       │ 1               │ 10,000            │
 * │ MainCover4    │ 4 số (chọn)│ 1 số       │ C(35,1) = 31    │ 310,000           │
 * │               │ +1 bất kỳ  │            │ (31 tổ hợp 5)   │                   │
 * │ MainCover     │ 5+ số      │ 1 số       │ C(N,5)          │ C(N,5) × 10,000   │
 * │ SpecialCover  │ 5 số       │ all 12     │ 12              │ 120,000           │
 * └───────────────┴────────────┴────────────┴─────────────────┴───────────────────┘
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
  return combination(MAIN_PICK, k) * combination(MAIN_POOL - MAIN_PICK, MAIN_PICK - k);
}

/** Thông tin xác suất cho 1 tier. */
export interface TierOdds {
  /** Mã hạng giải (jackpot, tier1, tier2...). */
  tier: PrizeTier;
  /** Tên hiển thị tiếng Việt (ví dụ: "Giải Độc Đắc"). */
  label: string;
  /** Số cách trúng (favorable outcomes) trong không gian mẫu. */
  ways: number;
  /** Xác suất trúng P = ways / TOTAL_OUTCOMES. */
  probability: number;
  /** Tỷ lệ nghịch đảo "1 trong N" (= 1 / probability). Ví dụ: 3,895,584 nghĩa là 1 trong gần 3.9 triệu. */
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
