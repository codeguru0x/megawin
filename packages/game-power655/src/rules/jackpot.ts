/**
 * Power 6/55 – Jackpot Accumulation & Split Cycle
 *
 * Power 6/55 có 2 jackpot tích luỹ:
 *   - Jackpot 1: tối thiểu 30 tỷ (trùng 6/6)
 *   - Jackpot 2: tối thiểu 3 tỷ (trùng 5/6 + bonus)
 *
 * Công thức tích luỹ (tương tự Lotto 5/35):
 *   Tích luỹ = Revenue - FixedPrizes - AgentCommission - CompanyTake
 *   (Revenue = 100% doanh thu, Commission = 20%, Company = 15%)
 *
 * Phân bổ tích luỹ:
 *   JP1 nhận 90% tích luỹ, JP2 nhận 10%
 *   Khi JP1 vượt ngưỡng (300 tỷ) → phần vượt chuyển sang JP2
 */

import { PrizeTier } from "../entities/enums";
import type {
  JackpotConfig,
  FinancialRates,
  PrizeAmounts,
  PlayRules,
  SplitRatios,
} from "../entities/types";

// ─── Draw Financial Calculation ───

export interface DrawFinancialInput {
  totalRevenue: number;
  totalFixedPrizes: number;
  tenantRevenues: Array<{
    tenantId: string;
    revenue: number;
    commission: number;
    commissionRate: number;
  }>;
  companyRate: number;
  /** JP1 contribution ratio (default 0.9) */
  jp1Ratio: number;
  /** JP2 contribution ratio (default 0.1) */
  jp2Ratio: number;
  /** JP1 overflow threshold – phần vượt chuyển sang JP2 */
  jp1OverflowThreshold: number;
  /** JP1 opening amount hiện tại – để tính overflow */
  currentJp1Opening: number;
}

export interface DrawFinancialResult {
  totalRevenue: number;
  totalFixedPrizes: number;
  totalAgentCommission: number;
  companyTake: number;
  actualCompanyTake: number;
  jackpot1Contribution: number;
  jackpot2Contribution: number;
  jp1Overflow: number;
  totalJackpotContribution: number;
  tenantBreakdown: Array<{
    tenantId: string;
    revenue: number;
    commission: number;
    commissionRate: number;
  }>;
}

export function calculateDrawFinancials(
  input: DrawFinancialInput
): DrawFinancialResult {
  const {
    totalRevenue,
    totalFixedPrizes,
    tenantRevenues,
    companyRate,
    jp1Ratio,
    jp2Ratio,
    jp1OverflowThreshold,
    currentJp1Opening,
  } = input;

  const tenantBreakdown = tenantRevenues.map((t) => ({
    tenantId: t.tenantId,
    revenue: t.revenue,
    commission: t.commission,
    commissionRate: t.commissionRate,
  }));

  const totalAgentCommission = tenantBreakdown.reduce(
    (sum, t) => sum + t.commission,
    0
  );

  const companyTake = Math.round(totalRevenue * companyRate);
  const remainAfterPrizes =
    totalRevenue - totalFixedPrizes - totalAgentCommission;
  const actualCompanyTake = Math.min(
    companyTake,
    Math.max(remainAfterPrizes, 0)
  );
  const totalJackpotContribution = Math.max(
    remainAfterPrizes - actualCompanyTake,
    0
  );

  // Phân bổ tích luỹ: JP1 = 90%, JP2 = 10%
  let rawJp1Contribution = Math.round(totalJackpotContribution * jp1Ratio);
  let rawJp2Contribution = totalJackpotContribution - rawJp1Contribution;

  // Overflow: nếu JP1 sau khi cộng vượt ngưỡng → phần vượt chuyển sang JP2
  let jp1Overflow = 0;
  const projectedJp1 = currentJp1Opening + rawJp1Contribution;
  if (projectedJp1 > jp1OverflowThreshold && jp1OverflowThreshold > 0) {
    jp1Overflow = projectedJp1 - jp1OverflowThreshold;
    rawJp1Contribution -= jp1Overflow;
    rawJp2Contribution += jp1Overflow;
  }

  return {
    totalRevenue,
    totalFixedPrizes,
    totalAgentCommission,
    companyTake,
    actualCompanyTake,
    jackpot1Contribution: rawJp1Contribution,
    jackpot2Contribution: rawJp2Contribution,
    jp1Overflow,
    totalJackpotContribution,
    tenantBreakdown,
  };
}

// ─── Jackpot Rollover ───

export function calculateNextJackpot1(
  currentOpening: number,
  contribution: number,
  hasWinner: boolean,
  seedAmount: number
): number {
  if (hasWinner) return seedAmount + contribution;
  return currentOpening + contribution;
}

export function calculateNextJackpot2(
  currentOpening: number,
  contribution: number,
  hasWinner: boolean,
  seedAmount: number
): number {
  if (hasWinner) return seedAmount + contribution;
  return currentOpening + contribution;
}

// ─── Split Cycle Logic ───

export function isSplitCycleDraw(
  totalJackpot: number,
  splitThreshold: number,
  hasAnyJackpotWinner: boolean
): boolean {
  return totalJackpot >= splitThreshold && !hasAnyJackpotWinner;
}

export interface SplitInput {
  totalAmount: number;
  splitRatios: SplitRatios;
  winnerCountPerTier: Map<PrizeTier, number>;
}

export interface SplitTierDetail {
  initialAmount: number;
  redistributedAmount: number;
  totalAmount: number;
  winnerCount: number;
  bonusPerWinner: number;
}

export interface SplitResult {
  details: Map<PrizeTier, SplitTierDetail>;
  bonusPerWinner: Map<PrizeTier, number>;
  roundingRemainder: number;
}

const SPLIT_ROUNDING_UNIT = 5_000;

function roundDownToUnit(value: number, unit: number): number {
  return Math.floor(value / unit) * unit;
}

export function calculateSplitDistribution(input: SplitInput): SplitResult {
  const { totalAmount, splitRatios, winnerCountPerTier } = input;

  const allEligible: Array<{ tier: PrizeTier; parts: number }> = [
    { tier: PrizeTier.Tier1, parts: splitRatios.tier1 },
    { tier: PrizeTier.Tier2, parts: splitRatios.tier2 },
    { tier: PrizeTier.Tier3, parts: splitRatios.tier3 },
  ];

  const totalParts = allEligible.reduce((s, e) => s + e.parts, 0);

  const tierAllocations = allEligible.map((e) => {
    const winnerCount = winnerCountPerTier.get(e.tier) ?? 0;
    return {
      tier: e.tier,
      initialAmount: Math.floor((totalAmount * e.parts) / totalParts),
      winnerCount,
      hasWinners: winnerCount > 0,
    };
  });

  const tiersWithWinners = tierAllocations.filter((t) => t.hasWinners);
  const details = new Map<PrizeTier, SplitTierDetail>();
  const bonusPerWinnerMap = new Map<PrizeTier, number>();

  if (tiersWithWinners.length === 0) {
    return { details, bonusPerWinner: bonusPerWinnerMap, roundingRemainder: 0 };
  }

  const unclaimedTotal = tierAllocations
    .filter((t) => !t.hasWinners)
    .reduce((s, t) => s + t.initialAmount, 0);

  const redistributedPerTier = Math.floor(
    unclaimedTotal / tiersWithWinners.length
  );

  const priorityOrder: PrizeTier[] = [
    PrizeTier.Tier1,
    PrizeTier.Tier2,
    PrizeTier.Tier3,
  ];
  const highestTierWithWinners = priorityOrder.find((tier) =>
    tiersWithWinners.some((t) => t.tier === tier)
  )!;

  let totalRemainder = 0;

  for (const t of tiersWithWinners) {
    const totalForTier = t.initialAmount + redistributedPerTier;

    if (t.tier === highestTierWithWinners) {
      const bonus = Math.floor(totalForTier / t.winnerCount);
      totalRemainder += totalForTier - bonus * t.winnerCount;
      details.set(t.tier, {
        initialAmount: t.initialAmount,
        redistributedAmount: redistributedPerTier,
        totalAmount: totalForTier,
        winnerCount: t.winnerCount,
        bonusPerWinner: bonus,
      });
      bonusPerWinnerMap.set(t.tier, bonus);
    } else {
      const roundedBonus = roundDownToUnit(
        totalForTier / t.winnerCount,
        SPLIT_ROUNDING_UNIT
      );
      totalRemainder += totalForTier - roundedBonus * t.winnerCount;
      details.set(t.tier, {
        initialAmount: t.initialAmount,
        redistributedAmount: redistributedPerTier,
        totalAmount: totalForTier,
        winnerCount: t.winnerCount,
        bonusPerWinner: roundedBonus,
      });
      bonusPerWinnerMap.set(t.tier, roundedBonus);
    }
  }

  if (totalRemainder > 0) {
    const detail = details.get(highestTierWithWinners)!;
    const remainderPerWinner = Math.floor(totalRemainder / detail.winnerCount);
    detail.bonusPerWinner += remainderPerWinner;
    bonusPerWinnerMap.set(highestTierWithWinners, detail.bonusPerWinner);
    totalRemainder -= remainderPerWinner * detail.winnerCount;
  }

  return {
    details,
    bonusPerWinner: bonusPerWinnerMap,
    roundingRemainder: totalRemainder,
  };
}

// ─── Default Config Values ───

export const DEFAULT_POWER655_CONFIG: {
  jackpot: JackpotConfig;
  rates: FinancialRates;
  defaultPrizes: PrizeAmounts;
  play: PlayRules;
} = {
  jackpot: {
    jackpot1: { seedAmount: 30_000_000_000 }, // 30 tỷ
    jackpot2: { seedAmount: 3_000_000_000 }, // 3 tỷ
    jp1ContributionRatio: 0.9, // JP1 nhận 90% tích luỹ
    jp2ContributionRatio: 0.1, // JP2 nhận 10% tích luỹ
    jp1OverflowThreshold: 300_000_000_000, // 300 tỷ → phần vượt chuyển JP2
    splitThreshold: 500_000_000_000, // 500 tỷ tổng JP → split cycle
    splitRatios: { tier1: 2, tier2: 1, tier3: 1 },
  },
  rates: {
    defaultCommissionRate: 0.2, // Hoa hồng đại lý 20%
    companyRate: 0.15, // Công ty thu về 15%
  },
  defaultPrizes: {
    tier1: 40_000_000, // Giải Nhất: 40 triệu
    tier2: 500_000, // Giải Nhì: 500k
    tier3: 50_000, // Giải Ba: 50k
  },
  play: {
    unitPrice: 10_000,
    maxBoardsPerTicket: 5,
    maxDrawCount: 6,
    salesCloseBeforeMinutes: 15, // 15 phút trước giờ quay (theo thể lệ)
    drawsPerDay: 1,
    drawTimes: ["18:00"],
    drawDaysOfWeek: [2, 4, 6], // Thứ 3, 5, 7
  },
};
