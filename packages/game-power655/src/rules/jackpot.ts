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

/**
 * Dữ liệu đầu vào để tính tài chính kỳ quay.
 *
 * Công thức:
 *   totalAgentCommission = Σ(tenantRevenues[].commission)
 *   companyTake = totalRevenue × companyRate
 *   actualCompanyTake = min(companyTake, max(totalRevenue - totalFixedPrizes - totalAgentCommission, 0))
 *   totalJackpotContribution = max(totalRevenue - totalFixedPrizes - totalAgentCommission - actualCompanyTake, 0)
 *   JP1 contribution = totalJackpotContribution × jp1Ratio
 *   JP2 contribution = totalJackpotContribution × jp2Ratio + jp1Overflow (nếu có)
 */
export interface DrawFinancialInput {
  /** Tổng doanh thu bán vé (100% tiền cược). Công thức: Σ(entry.stakeAmount) cho tất cả entries trong kỳ. */
  totalRevenue: number;
  /** Tổng tiền giải cố định phải trả (Nhất 40tr + Nhì 500k + Ba 50k × số lần trúng). */
  totalFixedPrizes: number;
  /** Chi tiết doanh thu và hoa hồng theo từng tenant/đại lý. */
  tenantRevenues: Array<{
    /** ID tenant/đại lý. */
    tenantId: string;
    /** Doanh thu từ tenant này. Công thức: Σ(entry.stakeAmount) cho entries của tenant. */
    revenue: number;
    /** Hoa hồng tenant nhận. Công thức: revenue × commissionRate. */
    commission: number;
    /** Tỷ lệ hoa hồng (VD: 0.2 = 20%). Lấy từ TenantConfig hoặc GlobalConfig default. */
    commissionRate: number;
  }>;
  /** Tỷ lệ công ty thu về (mặc định 0.15 = 15% doanh thu). */
  companyRate: number;
  /** Tỷ lệ JP1 nhận từ tổng tích luỹ (mặc định 0.9 = 90%). */
  jp1Ratio: number;
  /** Tỷ lệ JP2 nhận từ tổng tích luỹ (mặc định 0.1 = 10%). */
  jp2Ratio: number;
  /** Ngưỡng tối đa JP1 (VNĐ). Phần vượt chuyển sang JP2. Mặc định 300 tỷ. */
  jp1OverflowThreshold: number;
  /** Giá trị JP1 đầu kỳ hiện tại – dùng để tính overflow khi cộng contribution. */
  currentJp1Opening: number;
}

/**
 * Kết quả tính tài chính kỳ quay.
 * Ghi vào DrawFinancial sau khi settle xong.
 */
export interface DrawFinancialResult {
  /** Tổng doanh thu bán vé (100% tiền cược). */
  totalRevenue: number;
  /** Tổng tiền giải cố định phải trả (Nhất + Nhì + Ba). */
  totalFixedPrizes: number;
  /** Tổng hoa hồng đại lý. Công thức: Σ(tenantBreakdown[].commission). */
  totalAgentCommission: number;
  /** Công ty thu về dự kiến. Công thức: round(totalRevenue × companyRate). */
  companyTake: number;
  /** Công ty thu về thực tế. Công thức: min(companyTake, max(totalRevenue - totalFixedPrizes - totalAgentCommission, 0)). */
  actualCompanyTake: number;
  /** Tiền tích luỹ cộng vào JP1 (sau overflow). Công thức: totalJackpotContribution × jp1Ratio - jp1Overflow. */
  jackpot1Contribution: number;
  /** Tiền tích luỹ cộng vào JP2 (bao gồm overflow). Công thức: totalJackpotContribution × jp2Ratio + jp1Overflow. */
  jackpot2Contribution: number;
  /** Phần JP1 vượt ngưỡng chuyển sang JP2. Công thức: max(currentJp1Opening + rawJp1 - jp1OverflowThreshold, 0). */
  jp1Overflow: number;
  /** Tổng tiền tích luỹ vào jackpot pool. Công thức: max(totalRevenue - totalFixedPrizes - totalAgentCommission - actualCompanyTake, 0). */
  totalJackpotContribution: number;
  /** Chi tiết tài chính theo từng tenant/đại lý. */
  tenantBreakdown: Array<{
    /** ID tenant/đại lý. */
    tenantId: string;
    /** Doanh thu từ tenant. */
    revenue: number;
    /** Hoa hồng tenant nhận. Công thức: revenue × commissionRate. */
    commission: number;
    /** Tỷ lệ hoa hồng tenant. */
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

/**
 * Dữ liệu đầu vào cho tính split cycle.
 * Khi tổng JP vượt splitThreshold và không có winner → chia jackpot cho các giải cố định.
 */
export interface SplitInput {
  /** Tổng số tiền đem chia (= JP1 + JP2 tại thời điểm split). */
  totalAmount: number;
  /** Tỷ lệ chia cho từng hạng giải cố định. VD: {tier1: 2, tier2: 1, tier3: 1} = 50%/25%/25%. */
  splitRatios: SplitRatios;
  /** Số lượng winner theo từng hạng giải cố định trong kỳ này. Key = PrizeTier (tier1/tier2/tier3). */
  winnerCountPerTier: Map<PrizeTier, number>;
}

/**
 * Chi tiết split cho 1 hạng giải.
 * Tính bởi calculateSplitDistribution().
 */
export interface SplitTierDetail {
  /** Số tiền phân bổ ban đầu từ tỷ lệ splitRatios. Công thức: floor(totalAmount × parts / totalParts). */
  initialAmount: number;
  /** Số tiền nhận thêm từ các tier không có winner. Công thức: floor(unclaimedTotal / số tier có winner). */
  redistributedAmount: number;
  /** Tổng tiền cho tier này. Công thức: initialAmount + redistributedAmount. */
  totalAmount: number;
  /** Số lượng winner ở tier này. */
  winnerCount: number;
  /** Bonus mỗi winner nhận. Công thức: floor(totalAmount / winnerCount), làm tròn xuống 5.000đ (trừ tier ưu tiên cao nhất). */
  bonusPerWinner: number;
}

/**
 * Kết quả tính phân bổ split cycle.
 * Phần dư (rounding) giữ lại cho hệ thống, không phân bổ thêm.
 */
export interface SplitResult {
  /** Chi tiết chia cho từng hạng giải. Chỉ chứa các tier có winner. */
  details: Map<PrizeTier, SplitTierDetail>;
  /** Bonus mỗi winner nhận, key = PrizeTier. Lấy nhanh không cần truy cập details. */
  bonusPerWinner: Map<PrizeTier, number>;
  /** Phần dư sau khi chia (do làm tròn). Giữ lại trong hệ thống. */
  roundingRemainder: number;
}

/** Đơn vị làm tròn xuống cho bonus split (5.000đ). Áp dụng cho các tier thấp hơn tier ưu tiên cao nhất. */
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

/**
 * Giá trị config mặc định cho Power 6/55 (theo thể lệ Vietlott).
 * Dùng khi tạo GlobalConfig lần đầu.
 */
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
