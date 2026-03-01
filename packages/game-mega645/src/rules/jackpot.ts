/**
 * Mega 6/45 – Jackpot Accumulation & Split Cycle
 *
 * Công thức tích luỹ Jackpot mỗi kỳ quay:
 *   JackpotContribution = Revenue - FixedPrizes - AgentCommission - CompanyTake
 *
 * Cơ chế chia giải (Split Cycle):
 *   Khi Jackpot >= splitThreshold và không ai trúng Jackpot:
 *   - tier1 (5/6): nhận 2/5 giá trị Jackpot
 *   - tier2 (4/6): nhận 2/5 giá trị Jackpot
 *   - tier3 (3/6): nhận 1/5 giá trị Jackpot
 *   - Tier nào không có người trúng → phần đó chia đều cho các tier còn lại
 */

import { PrizeTier } from "../entities/enums";
import type {
  JackpotConfig,
  FinancialRates,
  PrizeAmounts,
  PlayRules,
  SplitRatios,
} from "../entities/types";

// ─────────────────────────────────────────────
// Draw Financial Calculation
// ─────────────────────────────────────────────

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
}

export interface DrawFinancialResult {
  totalRevenue: number;
  totalFixedPrizes: number;
  totalAgentCommission: number;
  companyTake: number;
  actualCompanyTake: number;
  jackpotContribution: number;
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
  const { totalRevenue, totalFixedPrizes, tenantRevenues, companyRate } = input;

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
  const jackpotContribution = Math.max(
    remainAfterPrizes - actualCompanyTake,
    0
  );

  return {
    totalRevenue,
    totalFixedPrizes,
    totalAgentCommission,
    companyTake,
    actualCompanyTake,
    jackpotContribution,
    tenantBreakdown,
  };
}

// ─────────────────────────────────────────────
// Jackpot Rollover
// ─────────────────────────────────────────────

export function calculateNextJackpot(
  currentOpening: number,
  contribution: number,
  hasJackpotWinner: boolean,
  seedAmount: number
): number {
  if (hasJackpotWinner) {
    return seedAmount + contribution;
  }
  return currentOpening + contribution;
}

// ─────────────────────────────────────────────
// Split Cycle Logic
// ─────────────────────────────────────────────

/**
 * Mega 6/45 chỉ có 1 kỳ/ngày → không cần check drawNo.
 * Điều kiện split: Jackpot >= splitThreshold && không ai trúng.
 */
export function isSplitCycleDraw(
  jackpotAmount: number,
  splitThreshold: number,
  hasJackpotWinner: boolean
): boolean {
  return jackpotAmount >= splitThreshold && !hasJackpotWinner;
}

export interface SplitInput {
  jackpotAmount: number;
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
  const { jackpotAmount, splitRatios, winnerCountPerTier } = input;

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
      initialAmount: Math.floor((jackpotAmount * e.parts) / totalParts),
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
      const tierRemainder = totalForTier - bonus * t.winnerCount;
      totalRemainder += tierRemainder;

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
      const tierRemainder = totalForTier - roundedBonus * t.winnerCount;
      totalRemainder += tierRemainder;

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

// ─────────────────────────────────────────────
// Default Config Values
// ─────────────────────────────────────────────

export const DEFAULT_MEGA645_CONFIG: {
  jackpot: JackpotConfig;
  rates: FinancialRates;
  defaultPrizes: PrizeAmounts;
  play: PlayRules;
} = {
  jackpot: {
    seedAmount: 12_000_000_000,
    splitThreshold: 12_000_000_000,
    splitRatios: { tier1: 2, tier2: 2, tier3: 1 },
  },
  rates: {
    defaultCommissionRate: 0.2,
    companyRate: 0.15,
  },
  defaultPrizes: {
    tier1: 10_000_000,
    tier2: 300_000,
    tier3: 30_000,
  },
  play: {
    unitPrice: 10_000,
    maxBoardsPerTicket: 6,
    maxDrawCount: 6,
    salesCloseBeforeMinutes: 5,
    drawsPerWeek: 3,
    drawDaysOfWeek: [0, 3, 5],
    drawTime: "18:00",
  },
};
