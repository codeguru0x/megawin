/**
 * Power 6/55 – Odds & Profit Calculator
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * I. MÔ TẢ TRÒ CHƠI
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *   Power 6/55 quay 6 số chính từ tập {1, 2, ..., 55} và 1 số bonus
 *   từ 49 số còn lại. Người chơi chọn 6 số chính.
 *
 *   Giá vé: 10,000 VND / line (Standard play).
 *   Lịch quay: Thứ 3, Thứ 5, Thứ 7 — 18h00.
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * II. KHÔNG GIAN MẪU (Sample Space)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *   Tổng cách chọn 6 số từ 55 số:
 *     C(55,6) = 55! / (6! × 49!)
 *            = (55 × 54 × 53 × 52 × 51 × 50) / (6 × 5 × 4 × 3 × 2 × 1)
 *            = 20,872,566,000 / 720
 *            = 28,989,675
 *
 *   Bonus number: 1 quả bóng từ 49 quả còn lại → P(bonus match) = 1/49
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * III. CÔNG THỨC XÁC SUẤT TỪNG GIẢI
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *   Công thức chung: trùng k trong 6 số chính
 *     Ways(k) = C(6, k) × C(49, 6-k)
 *     P(k)    = Ways(k) / C(55,6)
 *
 * ┌────────────────┬──────┬────────────┬─────────────────┬──────────────────────────────────────────┐
 * │ Giải           │ Main │ Bonus      │ Favorable       │ Xác suất                                 │
 * │                │ match│            │ outcomes        │                                          │
 * ├────────────────┼──────┼────────────┼─────────────────┼──────────────────────────────────────────┤
 * │ Jackpot 1      │ 6/6  │ (bất kỳ)  │ 1               │ 1/28,989,675 ≈ 3.449 × 10⁻⁸             │
 * │                │      │            │                 │ → 1 trong 28,989,675                     │
 * ├────────────────┼──────┼────────────┼─────────────────┼──────────────────────────────────────────┤
 * │ Jackpot 2      │ 5/6  │ ✓ matched  │ 6               │ 6/28,989,675 ≈ 2.070 × 10⁻⁷             │
 * │                │      │            │                 │ → 1 trong 4,831,612.5                    │
 * │                │      │            │ Chi tiết:       │                                          │
 * │                │      │            │ C(6,5)×C(49,1)  │ = 6 × 49 = 294 cách trùng 5/6           │
 * │                │      │            │ × P(bonus) 1/49 │ = 294 / 49 = 6 favorable outcomes       │
 * ├────────────────┼──────┼────────────┼─────────────────┼──────────────────────────────────────────┤
 * │ Giải Nhất      │ 5/6  │ ✗ no match │ 288             │ 288/28,989,675 ≈ 9.934 × 10⁻⁶           │
 * │ (Tier 1)       │      │            │                 │ → 1 trong 100,658.6                      │
 * │                │      │            │ Chi tiết:       │                                          │
 * │                │      │            │ 294 × 48/49     │ = 288 favorable outcomes                 │
 * ├────────────────┼──────┼────────────┼─────────────────┼──────────────────────────────────────────┤
 * │ Giải Nhì       │ 4/6  │ (bất kỳ)  │ 17,640          │ 17,640/28,989,675 ≈ 6.085 × 10⁻⁴        │
 * │ (Tier 2)       │      │            │                 │ → 1 trong 1,643.3                        │
 * │                │      │            │ Chi tiết:       │                                          │
 * │                │      │            │ C(6,4)×C(49,2)  │ = 15 × 1,176 = 17,640                   │
 * ├────────────────┼──────┼────────────┼─────────────────┼──────────────────────────────────────────┤
 * │ Giải Ba        │ 3/6  │ (bất kỳ)  │ 368,480         │ 368,480/28,989,675 ≈ 1.271 × 10⁻²       │
 * │ (Tier 3)       │      │            │                 │ → 1 trong 78.7                           │
 * │                │      │            │ Chi tiết:       │                                          │
 * │                │      │            │ C(6,3)×C(49,3)  │ = 20 × 18,424 = 368,480                 │
 * ├────────────────┼──────┼────────────┼─────────────────┼──────────────────────────────────────────┤
 * │ Không trúng    │ ≤2/6 │ (bất kỳ)  │ 28,603,267      │ ≈ 98.67%                                 │
 * └────────────────┴──────┴────────────┴─────────────────┴──────────────────────────────────────────┘
 *
 *   Lưu ý về Bonus Number:
 *   - Bonus number được quay từ 49 số KHÔNG nằm trong 6 số trúng.
 *   - Nếu player trùng 6/6, cả 6 số của họ = 6 số trúng → không thể match bonus.
 *   - Bonus chỉ có ý nghĩa khi trùng 5/6: 1 số còn lại CÓ THỂ = bonus.
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * IV. CƠ CẤU GIẢI THƯỞNG MẶC ĐỊNH
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * ┌────────────────┬──────────────────────┬──────────────────────────────┐
 * │ Giải           │ Giá trị thưởng       │ Tỷ lệ kế hoạch (% doanh thu)│
 * ├────────────────┼──────────────────────┼──────────────────────────────┤
 * │ Jackpot 1      │ Tích luỹ (seed 30 tỷ)│ 37.47%                      │
 * │ Jackpot 2      │ Tích luỹ (seed 3 tỷ) │ 4.16%                       │
 * │ Giải Nhất      │ 40,000,000 VND       │ 3.97%                       │
 * │ Giải Nhì       │ 500,000 VND          │ 3.04%                       │
 * │ Giải Ba        │ 50,000 VND           │ 6.36%                       │
 * ├────────────────┼──────────────────────┼──────────────────────────────┤
 * │ TỔNG           │                      │ 55.00%                      │
 * └────────────────┴──────────────────────┴──────────────────────────────┘
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * V. PHÂN TÍCH LỢI NHUẬN (chỉ tính các giải cố định)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *   Công thức cho mỗi tier:
 *     Expected Payout / line  = P(tier) × Prize(tier)
 *     Payout Ratio           = Expected Payout / Unit Price
 *     Break-even Prize       = Unit Price / P(tier)
 *       (giá trị giải tối đa để không lỗ cho tier này)
 *
 *   Với giá trị mặc định (unit price = 10,000 VND):
 *
 * ┌─────────────┬───────────────┬───────────────┬─────────────────┬──────────────┬──────────────────┐
 * │ Giải        │ Xác suất      │ Giải thưởng   │ Expected Payout │ Payout Ratio │ Break-even Prize │
 * ├─────────────┼───────────────┼───────────────┼─────────────────┼──────────────┼──────────────────┤
 * │ Giải Nhất   │ 1/100,658.6   │ 40,000,000    │ 397.38 VND      │ 3.97%        │ 1,006,586,000    │
 * │ Giải Nhì    │ 1/1,643.3     │ 500,000       │ 304.35 VND      │ 3.04%        │ 16,433,000       │
 * │ Giải Ba     │ 1/78.7        │ 50,000        │ 635.47 VND      │ 6.35%        │ 787,000          │
 * ├─────────────┼───────────────┼───────────────┼─────────────────┼──────────────┼──────────────────┤
 * │ TỔNG        │               │               │ 1,337.20 VND    │ 13.37%       │                  │
 * └─────────────┴───────────────┴───────────────┴─────────────────┴──────────────┴──────────────────┘
 *
 *   Gross Margin / line = 10,000 - 1,337.20 = 8,662.80 VND (86.63%)
 *   (Phần margin này dùng cho: Commission 20% + Company 15% + Jackpot tích luỹ)
 *
 *   Phân bổ doanh thu mỗi line (mặc định):
 *     100% Revenue = 10,000 VND
 *     ├── 20% Hoa hồng đại lý    = 2,000 VND
 *     ├── 15% Công ty thu về      = 1,500 VND
 *     ├── ~13.37% Giải cố định    ≈ 1,337 VND
 *     └── ~51.63% Tích luỹ JP     ≈ 5,163 VND
 *         ├── 90% → Jackpot 1     ≈ 4,647 VND
 *         └── 10% → Jackpot 2     ≈ 516 VND
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * VI. CÁC LOẠI VÉ (Play Types) VÀ GIÁ VÉ
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * ┌─────────────┬───────────┬─────────────────────────┬────────────────────┐
 * │ Loại vé     │ Chọn bao  │ Số lines                │ Giá vé / draw      │
 * │             │ nhiêu số  │                         │ (× 10,000 VND)     │
 * ├─────────────┼───────────┼─────────────────────────┼────────────────────┤
 * │ Standard    │ 6 số      │ C(6,6)   = 1            │ 10,000             │
 * │ Bao 5       │ 5 số      │ 55-5     = 50           │ 500,000            │
 * │ Bao 7       │ 7 số      │ C(7,6)   = 7            │ 70,000             │
 * │ Bao 8       │ 8 số      │ C(8,6)   = 28           │ 280,000            │
 * │ Bao 9       │ 9 số      │ C(9,6)   = 84           │ 840,000            │
 * │ Bao 10      │ 10 số     │ C(10,6)  = 210          │ 2,100,000          │
 * │ Bao 11      │ 11 số     │ C(11,6)  = 462          │ 4,620,000          │
 * │ Bao 12      │ 12 số     │ C(12,6)  = 924          │ 9,240,000          │
 * │ Bao 13      │ 13 số     │ C(13,6)  = 1,716        │ 17,160,000         │
 * │ Bao 14      │ 14 số     │ C(14,6)  = 3,003        │ 30,030,000         │
 * │ Bao 15      │ 15 số     │ C(15,6)  = 5,005        │ 50,050,000         │
 * │ Bao 18      │ 18 số     │ C(18,6)  = 18,564       │ 185,640,000        │
 * └─────────────┴───────────┴─────────────────────────┴────────────────────┘
 *
 *   Multi-draw: Giá vé tổng = Giá vé / draw × Số kỳ (tối đa 10 kỳ)
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * VII. CƠ CHẾ JACKPOT
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *   Tích luỹ mỗi kỳ:
 *     JP Contribution = Revenue - FixedPrizes - AgentCommission - CompanyTake
 *     JP1 += 90% × JP Contribution
 *     JP2 += 10% × JP Contribution
 *
 *   Overflow: Khi JP1 > 300 tỷ → phần vượt chuyển sang JP2
 *   Reseed: Khi có winner → JP1 reseed 30 tỷ, JP2 reseed 3 tỷ
 */

import { PrizeTier } from "../entities/enums";
import { POWER655_MAIN_MAX, POWER655_MAIN_COUNT, type PrizeAmounts } from "../entities/types";
import { combination } from "./play-types";

const MAIN_POOL = POWER655_MAIN_MAX; // 55
const MAIN_PICK = POWER655_MAIN_COUNT; // 6
const BONUS_POOL = MAIN_POOL - MAIN_PICK; // 49

export const TOTAL_MAIN_OUTCOMES = combination(MAIN_POOL, MAIN_PICK); // 28,989,675

function mainMatchWays(k: number): number {
  return combination(MAIN_PICK, k) * combination(MAIN_POOL - MAIN_PICK, MAIN_PICK - k);
}

export interface TierOdds {
  tier: PrizeTier;
  label: string;
  ways: number;
  probability: number;
  oneInN: number;
  /** Tỷ lệ trả thưởng kế hoạch theo thể lệ (%) */
  plannedPayoutRate: number;
}

function computeTierOdds(): Map<PrizeTier, { ways: number; probability: number; plannedPayoutRate: number }> {
  const totalMainCombos = TOTAL_MAIN_OUTCOMES;
  const odds = new Map<PrizeTier, { ways: number; probability: number; plannedPayoutRate: number }>();

  const match6ways = mainMatchWays(6); // 1
  const match5ways = mainMatchWays(5); // C(6,5)×C(49,1) = 6×49 = 294
  const match4ways = mainMatchWays(4); // C(6,4)×C(49,2) = 15×1176 = 17,640
  const match3ways = mainMatchWays(3); // C(6,3)×C(49,3) = 20×18424 = 368,480

  // Jackpot 1: trùng 6/6 → P = 1/C(55,6)
  odds.set(PrizeTier.Jackpot1, {
    ways: match6ways,
    probability: match6ways / totalMainCombos,
    plannedPayoutRate: 37.47,
  });

  // Jackpot 2: trùng 5/6 + bonus → P = match5ways/C(55,6) × 1/49
  // favorable outcomes = 294 × (1/49) = 6
  odds.set(PrizeTier.Jackpot2, {
    ways: match5ways / BONUS_POOL, // 294/49 = 6 favorable outcomes
    probability: match5ways / totalMainCombos / BONUS_POOL,
    plannedPayoutRate: 4.16,
  });

  // Giải Nhất: trùng 5/6 (no bonus) → P = match5ways/C(55,6) × 48/49
  // favorable outcomes = 294 × (48/49) = 288
  odds.set(PrizeTier.Tier1, {
    ways: (match5ways * (BONUS_POOL - 1)) / BONUS_POOL, // 294×48/49 = 288
    probability: (match5ways / totalMainCombos) * ((BONUS_POOL - 1) / BONUS_POOL),
    plannedPayoutRate: 3.97,
  });

  // Giải Nhì: trùng 4/6 → P = match4ways/C(55,6)
  odds.set(PrizeTier.Tier2, {
    ways: match4ways,
    probability: match4ways / totalMainCombos,
    plannedPayoutRate: 3.04,
  });

  // Giải Ba: trùng 3/6 → P = match3ways/C(55,6)
  odds.set(PrizeTier.Tier3, {
    ways: match3ways,
    probability: match3ways / totalMainCombos,
    plannedPayoutRate: 6.36,
  });

  return odds;
}

const TIER_ODDS = computeTierOdds();

const TIER_LABELS: Record<string, string> = {
  [PrizeTier.Jackpot1]: "Giải Jackpot 1",
  [PrizeTier.Jackpot2]: "Giải Jackpot 2",
  [PrizeTier.Tier1]: "Giải Nhất",
  [PrizeTier.Tier2]: "Giải Nhì",
  [PrizeTier.Tier3]: "Giải Ba",
};

export function getOddsTable(): TierOdds[] {
  const tiers: PrizeTier[] = [
    PrizeTier.Jackpot1,
    PrizeTier.Jackpot2,
    PrizeTier.Tier1,
    PrizeTier.Tier2,
    PrizeTier.Tier3,
  ];
  return tiers.map((tier) => {
    const data = TIER_ODDS.get(tier)!;
    return {
      tier,
      label: TIER_LABELS[tier] ?? tier,
      ways: data.ways,
      probability: data.probability,
      oneInN: 1 / data.probability,
      plannedPayoutRate: data.plannedPayoutRate,
    };
  });
}

// ─── Profit Analysis ───

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
  const amounts: Record<string, number> = {
    [PrizeTier.Tier1]: prizes.tier1,
    [PrizeTier.Tier2]: prizes.tier2,
    [PrizeTier.Tier3]: prizes.tier3,
  };

  const tiers: TierProfitAnalysis[] = FIXED_TIERS.map((tier) => {
    const data = TIER_ODDS.get(tier)!;
    const probability = data.probability;
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
