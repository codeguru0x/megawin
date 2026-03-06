/**
 * Lotto 5/35 – Jackpot Accumulation & Split Cycle
 *
 * Công thức tích luỹ Jackpot mỗi kỳ quay:
 *
 *   JackpotContribution = Revenue - FixedPrizes - AgentCommission - CompanyTake
 *
 *   Trong đó:
 *   - Revenue          = 100% doanh thu tiền cược trong kỳ
 *   - FixedPrizes      = Tổng tiền trả thưởng giải cố định (tier1 → consolation)
 *   - AgentCommission  = Σ(commissionRate_i × revenue_i) cho từng tenant
 *   - CompanyTake      = companyRate × Revenue
 *
 * Cơ chế chia giải (Split Cycle):
 *   Khi Jackpot >= splitThreshold (mặc định 12 tỷ) và không ai trúng Jackpot,
 *   tại kỳ 21h ngày hôm sau:
 *   - tier1: nhận 2/6 giá trị Jackpot
 *   - tier2, tier3, tier4, tier5: mỗi tier nhận 1/6
 *   - consolation: không tham gia
 *   - Tier nào không có người trúng → phần đó chia đều cho các tier còn lại
 */

import { PrizeTier } from "../entities/enums";
import { DrawNo } from "../entities/types";
import type {
  JackpotConfig,
  FinancialRates,
  PrizeAmounts,
  PlayRules,
  SplitRatios,
} from "../entities/types";

// ─────────────────────────────────────────────
// Jackpot Accumulation
// ─────────────────────────────────────────────

/** Input cho tính toán tài chính 1 kỳ quay. */
export interface DrawFinancialInput {
  /** Tổng doanh thu tiền cược kỳ này (VND). */
  totalRevenue: number;

  /** Tổng tiền trả giải cố định (tier1 → consolation). */
  totalFixedPrizes: number;

  /**
   * Doanh thu + hoa hồng đã tính sẵn theo từng tenant.
   * commission.amount đã snapshot lúc place-bet, SUM từ DB.
   */
  tenantRevenues: Array<{
    /** ID tenant/đại lý. */
    tenantId: string;
    /** Doanh thu tiền cược từ tenant này trong kỳ (VND). */
    revenue: number;
    /** Hoa hồng đã tính sẵn = Σ(entry.tenant.commissionAmount) (VND). */
    commission: number;
  }>;

  /** Tỷ lệ công ty thu về (từ gameConfig.rates.companyRate). */
  companyRate: number;
}

/** Output sau tính toán tài chính. */
export interface DrawFinancialResult {
  /** Tổng doanh thu tiền cược (100% revenue, VND). */
  totalRevenue: number;
  /** Tổng tiền trả giải cố định tier1 → consolation (VND). */
  totalFixedPrizes: number;
  /** Tổng hoa hồng đại lý = Σ(entry.tenant.commissionAmount) (VND). */
  totalAgentCommission: number;

  /**
   * Tiền công ty thu về cấu hình (companyRate × revenue).
   * Đây là giá trị TỐI ĐA công ty muốn thu.
   */
  companyTake: number;

  /**
   * Tiền công ty thực thu. Có thể < companyTake khi doanh thu kỳ
   * không đủ bù giải thưởng + hoa hồng + 15%.
   * = min(companyTake, max(revenue - fixedPrizes - commission, 0))
   */
  actualCompanyTake: number;

  /**
   * Tiền tích luỹ vào Jackpot kỳ tiếp theo.
   * = max(revenue - fixedPrizes - commission - actualCompanyTake, 0).
   * Luôn >= 0: nếu tính ra âm (doanh thu không đủ bù) thì = 0.
   */
  jackpotContribution: number;

  /** Chi tiết hoa hồng từng tenant (dùng cho báo cáo tài chính chi tiết). */
  tenantBreakdown: Array<{
    /** ID tenant/đại lý. */
    tenantId: string;
    /** Doanh thu từ tenant này trong kỳ (VND). */
    revenue: number;
    /** Hoa hồng đại lý (VND). */
    commission: number;
  }>;
}

/**
 * Tính toán tài chính cho 1 kỳ quay.
 *
 * Công thức:
 *   Quỹ trả thưởng = 100% doanh thu tiền cược
 *   remainAfterPrizes = revenue - fixedPrizes - agentCommission
 *   actualCompanyTake = min(companyRate × revenue, max(remainAfterPrizes, 0))
 *   jackpotContribution = max(remainAfterPrizes - actualCompanyTake, 0)
 *
 * Nếu doanh thu không đủ bù giải thưởng + hoa hồng thì:
 * - Công ty thu = 0 (không có dư để thu)
 * - Tích luỹ Jackpot = 0 (không để giá trị âm)
 */
export function calculateDrawFinancials(input: DrawFinancialInput): DrawFinancialResult {
  const { totalRevenue, totalFixedPrizes, tenantRevenues, companyRate } = input;

  const tenantBreakdown = tenantRevenues.map((t) => ({
    tenantId: t.tenantId,
    revenue: t.revenue,
    commission: t.commission,
  }));

  const totalAgentCommission = tenantBreakdown.reduce((sum, t) => sum + t.commission, 0);

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
    tenantBreakdown,
  };
}

// ─────────────────────────────────────────────
// Jackpot Rollover
// ─────────────────────────────────────────────

/**
 * Tính Jackpot cuối kỳ (closing).
 *
 * - shouldReset = true (winner hoặc split thực tế) → seedAmount
 *   Contribution kỳ này đã tính vào giải thưởng winner, không cộng vào cycle mới.
 * - shouldReset = false → opening + contribution (tích luỹ bình thường)
 */
export function calculateClosingJackpot(
  currentOpening: number,
  contribution: number,
  shouldReset: boolean,
  seedAmount: number,
): number {
  if (shouldReset) {
    return seedAmount;
  }

  return currentOpening + contribution;
}

// ─────────────────────────────────────────────
// Split Cycle Logic
// ─────────────────────────────────────────────

/**
 * Kiểm tra kỳ quay có phải kỳ chia giải (split cycle) không.
 *
 * Điều kiện:
 * 1. Jackpot >= splitThreshold
 * 2. Không ai trúng Jackpot
 * 3. Đây là kỳ 21h (drawNo = 2) ngày hôm sau
 *
 * @param jackpotAmount   - Jackpot hiện tại
 * @param splitThreshold  - Ngưỡng chia (từ gameConfig)
 * @param hasJackpotWinner - Có ai trúng Jackpot không
 * @param drawNo          - Số thứ tự kỳ quay (1 = 13h, 2 = 21h)
 * @returns true nếu là kỳ chia giải
 */
export function isSplitCycleDraw(
  jackpotAmount: number,
  splitThreshold: number,
  hasJackpotWinner: boolean,
  drawNo: number,
): boolean {
  return jackpotAmount >= splitThreshold && !hasJackpotWinner && drawNo === DrawNo.Evening;
}

/** Input cho tính chia giải. */
export interface SplitInput {
  /** Giá trị Jackpot sẽ chia (VND). */
  jackpotAmount: number;

  /** Tỷ lệ chia (từ gameConfig). */
  splitRatios: SplitRatios;

  /**
   * Map: tier → số lượng giải trúng (number of winning entries/lines).
   * Tier nào không có người trúng → không có trong map hoặc = 0.
   * CHỈ bao gồm tier1-tier5 (consolation KHÔNG tham gia chia).
   */
  winnerCountPerTier: Map<PrizeTier, number>;
}

/**
 * Chi tiết phân bổ chia Jackpot cho 1 tier.
 * Dùng để lưu vào draw.jackpot.split và hiển thị trên backoffice.
 */
export interface SplitTierDetail {
  /** Phần chia ban đầu theo ratio (trước redistribute). */
  initialAmount: number;

  /** Phần bổ sung nhận từ tier không có người trúng. */
  redistributedAmount: number;

  /** Tổng = initialAmount + redistributedAmount. */
  totalAmount: number;

  /** Số lượng giải trúng trong tier này. */
  winnerCount: number;

  /**
   * Tiền bonus mỗi giải trúng = totalAmount / winnerCount.
   * - Hạng giải không phải cao nhất: làm tròn xuống đến 5.000 VND.
   * - Hạng giải cao nhất: nhận thêm phần dư từ làm tròn các hạng khác.
   */
  bonusPerWinner: number;
}

/** Output chia giải chi tiết. */
export interface SplitResult {
  /**
   * Map: tier → chi tiết phân bổ chia.
   * Chỉ chứa các tier có người trúng (tier không có winner bị loại).
   */
  details: Map<PrizeTier, SplitTierDetail>;

  /**
   * Map: tier → bonus mỗi giải trúng (VND, đã làm tròn).
   * Đây là giá trị BỔ SUNG cho giải cố định.
   * Tiện dùng: giải thưởng cuối = fixedAmount + bonusPerWinner.
   */
  bonusPerWinner: Map<PrizeTier, number>;

  /**
   * Phần dư còn lại sau khi chia hết (thường rất nhỏ, < winnerCount VND).
   * Xảy ra khi remainder / winnerCount không chia hết.
   */
  roundingRemainder: number;
}

/**
 * Đơn vị làm tròn xuống cho bonus chia Jackpot (Vietlott quy định 5.000 VND).
 * Áp dụng cho các hạng giải KHÔNG phải hạng cao nhất có người trúng.
 */
const SPLIT_ROUNDING_UNIT = 5_000;

function roundDownToUnit(value: number, unit: number): number {
  return Math.floor(value / unit) * unit;
}

export function calculateSplitDistribution(input: SplitInput): SplitResult {
  const { jackpotAmount, splitRatios, winnerCountPerTier } = input;

  const allEligible: Array<{
    tier: PrizeTier;
    parts: number;
  }> = [
    { tier: PrizeTier.Tier1, parts: splitRatios.tier1 },
    { tier: PrizeTier.Tier2, parts: splitRatios.tier2 },
    { tier: PrizeTier.Tier3, parts: splitRatios.tier3 },
    { tier: PrizeTier.Tier4, parts: splitRatios.tier4 },
    { tier: PrizeTier.Tier5, parts: splitRatios.tier5 },
  ];

  const totalParts = allEligible.reduce((s, e) => s + e.parts, 0);

  // Bước 1: tính phần chia ban đầu theo ratio
  const tierAllocations = allEligible.map((e) => {
    const winnerCount = winnerCountPerTier.get(e.tier) ?? 0;
    return {
      tier: e.tier,
      initialAmount: Math.floor((jackpotAmount * e.parts) / totalParts),
      winnerCount,
      hasWinners: winnerCount > 0,
    };
  });

  // Bước 2: redistribute phần chia của tier không có winner
  const tiersWithWinners = tierAllocations.filter((t) => t.hasWinners);

  const details = new Map<PrizeTier, SplitTierDetail>();
  const bonusPerWinnerMap = new Map<PrizeTier, number>();

  if (tiersWithWinners.length === 0) {
    return { details, bonusPerWinner: bonusPerWinnerMap, roundingRemainder: 0 };
  }

  // Tính tổng phần chia của các tier không có winner
  const unclaimedTotal = tierAllocations
    .filter((t) => !t.hasWinners)
    .reduce((s, t) => s + t.initialAmount, 0);

  // Tính phần bổ sung nhận từ các tier không có winner
  const redistributedPerTier = Math.floor(unclaimedTotal / tiersWithWinners.length);

  // Bước 3: xác định hạng giải cao nhất có người trúng
  const priorityOrder: PrizeTier[] = [
    PrizeTier.Tier1,
    PrizeTier.Tier2,
    PrizeTier.Tier3,
    PrizeTier.Tier4,
    PrizeTier.Tier5,
  ];

  // Tìm hạng giải cao nhất có người trúng
  const highestTierWithWinners = priorityOrder.find((tier) =>
    tiersWithWinners.some((t) => t.tier === tier),
  )!;

  // Bước 4: tính bonus per winner cho các tier có người trúng
  // - Hạng không phải cao nhất: làm tròn xuống 5.000 VND, tích phần dư vào hạng cao nhất
  // - Hạng cao nhất: floor 1 VND, nhận thêm phần dư từ các hạng khác
  let totalRemainder = 0;

  for (const t of tiersWithWinners) {
    const totalForTier = t.initialAmount + redistributedPerTier;

    if (t.tier === highestTierWithWinners) {
      // Hạng cao nhất: floor 1 VND, nhận thêm phần dư từ các hạng khác
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

      // Hạng không phải cao nhất: làm tròn xuống 5.000 VND, tích phần dư vào hạng cao nhất
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

  // Bước 5: cộng tổng phần dư vào hạng giải cao nhất
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

/** Giá trị mặc định cho global game config. Dùng khi seed database. */
export const DEFAULT_LOTTO535_CONFIG: {
  jackpot: JackpotConfig;
  rates: FinancialRates;
  defaultPrizes: PrizeAmounts;
  play: PlayRules;
} = {
  jackpot: {
    seedAmount: 1_000_000_000,
    splitThreshold: 12_000_000_000,
    splitRatios: { tier1: 2, tier2: 1, tier3: 1, tier4: 1, tier5: 1 },
  },
  rates: {
    defaultCommissionRate: 0.2,
    companyRate: 0.15,
  },
  defaultPrizes: {
    tier1: 10_000_000,
    tier2: 5_000_000,
    tier3: 500_000,
    tier4: 100_000,
    tier5: 30_000,
    consolation: 10_000,
  },
  play: {
    unitPrice: 10_000,
    maxBoardsPerTicket: 5,
    maxDrawCount: 6,
    salesCloseBeforeMinutes: 5,
    drawsPerDay: 2,
    drawTimes: ["13:00", "21:00"],
  },
};
