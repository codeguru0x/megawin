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
import { Lotto535OpsAlertType } from "../entities/ops-alert";
import type {
  FinancialRates,
  JackpotConfig,
  Lotto535OpsConfig,
  PlayRules,
  PrizeAmounts,
  SplitRatios,
} from "../entities/types";
import { DrawNo } from "../entities/types";

// ─────────────────────────────────────────────
// Jackpot Accumulation
// ─────────────────────────────────────────────

/** Input cho tính toán tài chính 1 kỳ quay. */
export interface DrawFinancialInput {
  /** Tổng doanh thu tiền cược kỳ này (VND). */
  totalRevenue: number;

  /** Tổng tiền trả giải cố định (tier1 → consolation). */
  totalFixedPrizes: number;

  /** Tổng hoa hồng đại lý (VND). Công thức: Σ(tenantAgg[].commission). */
  totalAgentCommission: number;

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
  const { totalRevenue, totalFixedPrizes, totalAgentCommission, companyRate } = input;

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
// Split Cycle Logic
// ─────────────────────────────────────────────

/**
 * Jackpot đã đạt ngưỡng chia (split threshold) chưa.
 *
 * CHỈ kiểm tra vế "đủ tiền" — KHÔNG phụ thuộc kỳ quay (drawNo) hay có winner hay không.
 * Dùng cho UI/API muốn hiển thị "Jackpot đã chạm ngưỡng chia" mà không có ngữ cảnh draw.
 * Điều kiện split ĐẦY ĐỦ (kèm drawNo + winner) xem {@link isSplitCycleDraw}.
 *
 * @param jackpotAmount  - Jackpot hiện tại (VND)
 * @param splitThreshold - Ngưỡng chia (từ gameConfig, VND)
 * @returns true nếu `jackpotAmount >= splitThreshold`
 */
export function hasReachedSplitThreshold(jackpotAmount: number, splitThreshold: number): boolean {
  return jackpotAmount >= splitThreshold;
}

/**
 * Kỳ quay CÓ ĐỦ điều kiện chia giải KHÔNG XÉT winner — "ý định chia".
 *
 * Điều kiện (CẢ HAI phải đúng):
 * 1. Jackpot >= splitThreshold (xem {@link hasReachedSplitThreshold})
 * 2. Đây là kỳ 21h (drawNo = 2, {@link DrawNo.Evening})
 *
 * Tách riêng với {@link isSplitCycleDraw} vì có những thời điểm CHƯA biết
 * winner (prepare-settle, hiển thị "kỳ này sẽ chia" trên UI current draw) —
 * khi đó chỉ cần vế ngưỡng + kỳ 21h. Kỳ chia THỰC TẾ còn phải không ai trúng
 * Jackpot (xem {@link isSplitCycleDraw}).
 *
 * @param jackpotAmount  - Jackpot hiện tại (VND)
 * @param splitThreshold - Ngưỡng chia (từ gameConfig, VND)
 * @param drawNo         - Số thứ tự kỳ quay (1 = 13h, 2 = 21h)
 * @returns true nếu Jackpot đủ ngưỡng và là kỳ 21h
 */
export function isSplitEligibleDraw(jackpotAmount: number, splitThreshold: number, drawNo: number): boolean {
  return hasReachedSplitThreshold(jackpotAmount, splitThreshold) && drawNo === DrawNo.Evening;
}

/**
 * Kiểm tra kỳ quay có phải kỳ chia giải (split cycle) không.
 *
 * Điều kiện (TẤT CẢ phải đúng):
 * 1. Jackpot >= splitThreshold + đúng kỳ 21h (xem {@link isSplitEligibleDraw})
 * 2. Không ai trúng Jackpot
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
  return isSplitEligibleDraw(jackpotAmount, splitThreshold, drawNo) && !hasJackpotWinner;
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

  // ── Pass 1: tính phần chia ban đầu theo ratio ──
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

  // ── Pass 2: redistribute unclaimed + tính bonus per winner ──
  const unclaimedTotal = tierAllocations.filter((t) => !t.hasWinners).reduce((s, t) => s + t.initialAmount, 0);

  const redistributedPerTier = Math.floor(unclaimedTotal / tiersWithWinners.length);

  const highestTierWithWinners = (
    [PrizeTier.Tier1, PrizeTier.Tier2, PrizeTier.Tier3, PrizeTier.Tier4, PrizeTier.Tier5] as PrizeTier[]
  ).find((tier) => tiersWithWinners.some((t) => t.tier === tier))!;

  let totalRemainder = 0;

  for (const t of tiersWithWinners) {
    const totalForTier = t.initialAmount + redistributedPerTier;
    const isHighest = t.tier === highestTierWithWinners;

    // Tier cao nhất: floor 1 VND (nhận phần dư từ các tier khác ở bước sau).
    // Tier khác: làm tròn xuống 5.000 VND theo quy tắc Vietlott.
    const rawBonus = Math.floor(totalForTier / t.winnerCount);
    const bonus = isHighest ? rawBonus : roundDownToUnit(rawBonus, SPLIT_ROUNDING_UNIT);

    totalRemainder += totalForTier - bonus * t.winnerCount;

    details.set(t.tier, {
      initialAmount: t.initialAmount,
      redistributedAmount: redistributedPerTier,
      totalAmount: totalForTier,
      winnerCount: t.winnerCount,
      bonusPerWinner: bonus,
    });
    bonusPerWinnerMap.set(t.tier, bonus);
  }

  // ── Gom phần dư → cộng vào tier cao nhất ──
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
  ops: Lotto535OpsConfig;
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
    minBetCount: 1,
    maxBetCount: 10,
    maxBoardsPerTicket: 5,
    maxDrawCount: 6,
    salesCloseBeforeMinutes: 5,
    drawsPerDay: 2,
    drawTimes: ["13:00", "21:00"],
  },
  /**
   * Cấu hình vận hành mặc định (analysis §3.8). Ngưỡng alert + nhịp/top-K stats.
   * Staff chỉnh trên tab "Vận hành"; đổi có hiệu lực trong ~1 chu kỳ worker.
   */
  ops: {
    alerts: {
      largeBetAmount: 30_000_000,
      fixedExposureWarnAmount: 500_000_000,
      comboAccountsWarn: 5,
      coverHighStakeAmount: 10_000_000,
      specialSkewRatio: 0.35,
      specialSkewMinAmount: 50_000_000,
      enabled: {
        [Lotto535OpsAlertType.LargeBet]: true,
        [Lotto535OpsAlertType.ExposureThreshold]: true,
        [Lotto535OpsAlertType.ComboConcentration]: true,
        [Lotto535OpsAlertType.CoverHighStake]: true,
        [Lotto535OpsAlertType.SpecialSkew]: true,
        // Để dành — không bắn ở P0.
        [Lotto535OpsAlertType.RevenueAnomaly]: false,
        [Lotto535OpsAlertType.SettleStuck]: false,
      },
    },
    stats: {
      tickSeconds: 10,
      topPotentialK: 50,
      topAccountsK: 50,
      topCombosK: 100,
    },
  },
};
