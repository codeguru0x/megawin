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

/** Đầu vào để tính toán tài chính 1 kỳ quay. */
export interface DrawFinancialInput {
  /** Tổng doanh thu bán vé kỳ quay (VND). Công thức: Σ(entry.amount). */
  totalRevenue: number;
  /** Tổng giải thưởng cố định đã trả (VND). Bao gồm tier1 + tier2 + tier3. */
  totalFixedPrizes: number;
  /** Doanh thu và hoa hồng chi tiết theo từng đại lý. */
  tenantRevenues: Array<{
    /** ID đại lý. */
    tenantId: string;
    /** Doanh thu từ đại lý (VND). */
    revenue: number;
    /** Hoa hồng đại lý (VND). Công thức: revenue × commissionRate. */
    commission: number;
  }>;
  /** Tỷ lệ thu nhập công ty. Ví dụ: 0.15 = 15%. */
  companyRate: number;
}

/** Kết quả tính toán tài chính 1 kỳ quay. */
export interface DrawFinancialResult {
  /** Tổng doanh thu bán vé (VND). */
  totalRevenue: number;
  /** Tổng giải thưởng cố định (VND). */
  totalFixedPrizes: number;
  /** Tổng hoa hồng đại lý (VND). Công thức: Σ(tenantBreakdown[].commission). */
  totalAgentCommission: number;
  /**
   * Thu nhập công ty lý thuyết (VND).
   * Công thức: round(totalRevenue × companyRate).
   */
  companyTake: number;
  /**
   * Thu nhập công ty thực tế (VND).
   * Công thức: min(companyTake, max(totalRevenue - totalFixedPrizes - totalAgentCommission, 0)).
   * Bảo đảm không âm và không vượt quá phần còn lại sau giải thưởng + hoa hồng.
   */
  actualCompanyTake: number;
  /**
   * Phần đóng góp vào quỹ Jackpot (VND).
   * Công thức: max(totalRevenue - totalFixedPrizes - totalAgentCommission - actualCompanyTake, 0).
   */
  jackpotContribution: number;
}

/**
 * Tính tài chính tổng hợp cho 1 kỳ quay Mega 6/45.
 *
 * Mega 6/45 có 1 Jackpot tích luỹ:
 *   jackpotContribution = max(revenue - fixedPrizes - commission - actualCompanyTake, 0)
 *
 * @param input - Dữ liệu tổng hợp từ DB
 * @returns Kết quả tài chính gồm jackpotContribution, actualCompanyTake, tenant breakdown
 */
export function calculateDrawFinancials(input: DrawFinancialInput): DrawFinancialResult {
  const { totalRevenue, totalFixedPrizes, tenantRevenues, companyRate } = input;

  const totalAgentCommission = tenantRevenues.reduce((sum, t) => sum + t.commission, 0);

  const companyTake = Math.round(totalRevenue * companyRate);
  const remainAfterPrizes = totalRevenue - totalFixedPrizes - totalAgentCommission;
  const actualCompanyTake = Math.min(companyTake, Math.max(remainAfterPrizes, 0));
  const jackpotContribution = Math.max(remainAfterPrizes - actualCompanyTake, 0);

  return {
    totalRevenue,
    totalFixedPrizes,
    totalAgentCommission,
    companyTake,
    actualCompanyTake,
    jackpotContribution,
  };
}

// ─────────────────────────────────────────────
// Jackpot Rollover
// ─────────────────────────────────────────────

export function calculateNextJackpot(
  currentOpening: number,
  contribution: number,
  hasJackpotWinner: boolean,
  seedAmount: number,
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
  hasJackpotWinner: boolean,
): boolean {
  return jackpotAmount >= splitThreshold && !hasJackpotWinner;
}

/** Đầu vào cho tính toán chia Jackpot (split cycle). */
export interface SplitInput {
  /** Giá trị Jackpot hiện tại sẽ chia (VND). */
  jackpotAmount: number;
  /** Tỷ lệ chia cho từng tier (tier1: 2, tier2: 2, tier3: 1). */
  splitRatios: SplitRatios;
  /** Số người trúng theo từng tier trong kỳ quay split. Key = PrizeTier. */
  winnerCountPerTier: Map<PrizeTier, number>;
}

/** Chi tiết phân bổ cho 1 tier trong split cycle. */
export interface SplitTierDetail {
  /**
   * Số tiền phân bổ ban đầu theo tỷ lệ (VND).
   * Công thức: floor(jackpotAmount × parts / totalParts).
   */
  initialAmount: number;
  /** Số tiền nhận thêm từ các tier không có người trúng (VND). */
  redistributedAmount: number;
  /** Tổng tiền cho tier (VND). Công thức: initialAmount + redistributedAmount. */
  totalAmount: number;
  /** Số người trúng tier này. */
  winnerCount: number;
  /**
   * Tiền thưởng bonus cho mỗi người trúng (VND).
   * Công thức: floor(totalAmount / winnerCount) hoặc roundDown đến bội số 5,000.
   * Tier có ưu tiên cao nhất (tier1) nhận phần dư từ rounding.
   */
  bonusPerWinner: number;
}

/** Kết quả tính toán chia Jackpot (split cycle). */
export interface SplitResult {
  /** Chi tiết phân bổ cho từng tier. Key = PrizeTier. */
  details: Map<PrizeTier, SplitTierDetail>;
  /** Tiền bonus mỗi người trúng theo tier. Key = PrizeTier. */
  bonusPerWinner: Map<PrizeTier, number>;
  /** Số tiền dư sau khi làm tròn (VND). Chuyển vào Jackpot kỳ sau. */
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

  const redistributedPerTier = Math.floor(unclaimedTotal / tiersWithWinners.length);

  const priorityOrder: PrizeTier[] = [PrizeTier.Tier1, PrizeTier.Tier2, PrizeTier.Tier3];

  const highestTierWithWinners = priorityOrder.find((tier) =>
    tiersWithWinners.some((t) => t.tier === tier),
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
      const roundedBonus = roundDownToUnit(totalForTier / t.winnerCount, SPLIT_ROUNDING_UNIT);
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
