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
import type { SplitRatios } from "../entities/types";
import type { GlobalConfigDoc } from "../entities/game-config";

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
   * Danh sách doanh thu + tỷ lệ hoa hồng theo từng tenant.
   * Dùng để tính tổng hoa hồng đại lý.
   */
  tenantRevenues: Array<{
    tenantId: string;
    revenue: number;
    commissionRate: number;
  }>;

  /** Tỷ lệ công ty thu về (từ gameConfig.rates.companyRate). */
  companyRate: number;
}

/** Output sau tính toán tài chính. */
export interface DrawFinancialResult {
  totalRevenue: number;
  totalFixedPrizes: number;
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
   * Luôn >= 0: nếu tính ra âm (doanh thu không đủ bù) thì = 0.
   */
  jackpotContribution: number;

  /** Chi tiết hoa hồng từng tenant. */
  tenantBreakdown: Array<{
    tenantId: string;
    revenue: number;
    commission: number;
    commissionRate: number;
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
export function calculateDrawFinancials(
  input: DrawFinancialInput
): DrawFinancialResult {
  const { totalRevenue, totalFixedPrizes, tenantRevenues, companyRate } = input;

  const tenantBreakdown = tenantRevenues.map((t) => ({
    tenantId: t.tenantId,
    revenue: t.revenue,
    commission: Math.round(t.revenue * t.commissionRate),
    commissionRate: t.commissionRate,
  }));

  const totalAgentCommission = tenantBreakdown.reduce(
    (sum, t) => sum + t.commission,
    0
  );

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
 * Tính Jackpot cho kỳ tiếp theo.
 *
 * - Có người trúng Jackpot → reset về seedAmount + contribution
 * - Không ai trúng → opening + contribution (tích luỹ)
 * - contribution luôn >= 0 (đã đảm bảo bởi calculateDrawFinancials)
 */
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
  drawNo: number
): boolean {
  return jackpotAmount >= splitThreshold && !hasJackpotWinner && drawNo === 2;
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
   * Đã làm tròn xuống đến đơn vị 5.000 VND.
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
   * Phần dư do làm tròn, cộng vào hạng giải cao nhất có người trúng.
   * (làm tròn xuống đến đơn vị 5.000 VND, phần dư tích lại)
   */
  roundingRemainder: number;
}

/**
 * Đơn vị làm tròn giải thưởng (VND).
 * Theo quy định Vietlott: làm tròn xuống đến đơn vị 5.000 VND.
 */
const ROUNDING_UNIT = 5_000;

/** Làm tròn xuống đến đơn vị ROUNDING_UNIT. */
function roundDown(amount: number): number {
  return Math.floor(amount / ROUNDING_UNIT) * ROUNDING_UNIT;
}

/**
 * Tính phân bổ chia Jackpot cho các tier (Chia Giải Độc Đắc).
 *
 * Luật chính thức (từ tài liệu Vietlott Lotto 5/35):
 *
 * 1. Phần chia Độc Đắc:
 *    - tier1 (Giải Nhất) = Jackpot / 3 (tỷ lệ 2/6)
 *    - tier2 = tier3 = tier4 = tier5 = Jackpot / 6 (tỷ lệ 1/6 mỗi tier)
 *    - consolation: KHÔNG tham gia chia
 *
 * 2. Redistribute:
 *    Tier nào không có người trúng → phần đó chia đều cho các tier
 *    còn lại CÓ người trúng (ngoại trừ Giải Khuyến Khích).
 *
 * 3. Chia đều cho winners:
 *    Phần chia mỗi tier / số lượng giải trúng trong tier đó.
 *
 * 4. Làm tròn:
 *    Làm tròn XUỐNG đến đơn vị 5.000 VND.
 *    Phần dư cộng vào hạng giải CAO NHẤT có người trúng.
 *
 * 5. Nếu TẤT CẢ tier1-tier5 đều không có winner:
 *    Jackpot tích luỹ vào kỳ tiếp theo, kỳ quay cuối cùng
 *    ngày liền kề tiếp là kỳ chia giải.
 *
 * @example
 * ```ts
 * // Jackpot 15 tỷ, có 2 người trúng tier1 và 10 người trúng tier5
 * const result = calculateSplitDistribution({
 *   jackpotAmount: 15_000_000_000,
 *   splitRatios: { tier1: 2, tier2: 1, tier3: 1, tier4: 1, tier5: 1 },
 *   winnerCountPerTier: new Map([
 *     [PrizeTier.Tier1, 2],
 *     [PrizeTier.Tier5, 10],
 *   ]),
 * });
 * // tier1: nhận 5 tỷ + redistribute từ tier2,3,4
 * // tier5: nhận 2.5 tỷ + redistribute từ tier2,3,4
 * ```
 */
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
    // Không tier nào có người trúng → Jackpot giữ nguyên, tích luỹ tiếp
    return { details, bonusPerWinner: bonusPerWinnerMap, roundingRemainder: 0 };
  }

  const unclaimedTotal = tierAllocations
    .filter((t) => !t.hasWinners)
    .reduce((s, t) => s + t.initialAmount, 0);

  // Chia đều unclaimed cho các tier có winners
  const redistributedPerTier = Math.floor(
    unclaimedTotal / tiersWithWinners.length
  );

  // Bước 3: tính bonus per winner + làm tròn
  let totalRemainder = 0;

  for (const t of tiersWithWinners) {
    const totalForTier = t.initialAmount + redistributedPerTier;
    const rawBonusPerWinner = totalForTier / t.winnerCount;
    const roundedBonus = roundDown(rawBonusPerWinner);

    // Phần dư = (rawBonus - roundedBonus) × winnerCount
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

  // Bước 4: phần dư cộng vào hạng giải cao nhất có người trúng
  // Thứ tự ưu tiên: tier1 > tier2 > tier3 > tier4 > tier5
  const priorityOrder: PrizeTier[] = [
    PrizeTier.Tier1,
    PrizeTier.Tier2,
    PrizeTier.Tier3,
    PrizeTier.Tier4,
    PrizeTier.Tier5,
  ];

  if (totalRemainder > 0) {
    for (const tier of priorityOrder) {
      const detail = details.get(tier);
      if (detail && detail.winnerCount > 0) {
        // Cộng phần dư (đã làm tròn xuống 5.000) cho hạng cao nhất
        const remainderPerWinner = roundDown(
          totalRemainder / detail.winnerCount
        );
        detail.bonusPerWinner += remainderPerWinner;
        bonusPerWinnerMap.set(tier, detail.bonusPerWinner);
        totalRemainder -= remainderPerWinner * detail.winnerCount;
        break;
      }
    }
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
export const DEFAULT_LOTTO535_CONFIG: Pick<
  GlobalConfigDoc,
  "jackpot" | "rates" | "defaultPrizes" | "play"
> = {
  jackpot: {
    seedAmount: 1_000_000_000,
    splitThreshold: 12_000_000_000,
    splitRatios: { tier1: 2, tier2: 1, tier3: 1, tier4: 1, tier5: 1 },
    splitRoundingUnit: 5_000,
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
    salesCloseBeforeMinutes: 30,
    drawsPerDay: 2,
    drawTimes: ["13:00", "21:00"],
    timezone: "Asia/Ho_Chi_Minh",
  },
};
