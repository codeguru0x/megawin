/**
 * Use Case: Calculate Financials (Power 6/55)
 *
 * Tính toán tài chính tổng hợp sau khi TẤT CẢ entries đã settled.
 *
 * Khác biệt so với Lotto 5/35:
 *   - Dùng calculateDrawFinancials với jp1Ratio, jp2Ratio, jp1OverflowThreshold
 *   - Tính riêng jackpot1Contribution và jackpot2Contribution
 *   - Xử lý JP1 overflow (phần vượt 300 tỷ chuyển sang JP2)
 *   - closingJp1 / closingJp2 thay vì single closingJackpot
 *
 * CRASH-SAFE: Aggregate TẤT CẢ settled entries từ DB.
 * IDEMPOTENT: Chạy lại bao nhiêu lần cũng cho kết quả giống nhau.
 */

import { StepFunctionUseCase } from "@megawin/app-core/use-cases";
import { PrizeTier } from "@megawin/game-power655/entities";
import {
  calculateDrawFinancials,
  calculateNextJackpot1,
  calculateNextJackpot2,
  calculateSplitDistribution,
  type DrawFinancialInput,
} from "@megawin/game-power655/rules";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";

export interface CalculateFinancialsInput {
  /** ID kỳ quay cần tính tài chính. */
  drawId: string;
  /** Số dư Jackpot 1 đầu kỳ (VND). */
  jp1OpeningAmount: number;
  /** Số dư Jackpot 2 đầu kỳ (VND). */
  jp2OpeningAmount: number;
  /** Có phải kỳ chia giải (split cycle) hay không. */
  isSplitCycle: boolean;
  /** Tổng số dòng cược trong kỳ quay. */
  totalLines: number;
  /** Cấu hình tài chính + jackpot cho tính toán. */
  config: {
    /** Giá trị khởi tạo JP1 khi bắt đầu cycle mới (VND). */
    jp1SeedAmount: number;
    /** Giá trị khởi tạo JP2 khi bắt đầu cycle mới (VND). */
    jp2SeedAmount: number;
    /** Tỷ lệ doanh thu đóng góp vào JP1 (0-1). */
    jp1Ratio: number;
    /** Tỷ lệ doanh thu đóng góp vào JP2 (0-1). */
    jp2Ratio: number;
    /** Ngưỡng tràn JP1 (VND). Phần vượt quá chuyển sang JP2. */
    jp1OverflowThreshold: number;
    /** Ngưỡng tổng JP để kích hoạt chia giải (VND). */
    splitThreshold: number;
    /** Tỷ lệ chia giải cho các tier khi split. */
    splitRatios: {
      /** Tỷ lệ chia cho tier1. */
      tier1: number;
      /** Tỷ lệ chia cho tier2. */
      tier2: number;
      /** Tỷ lệ chia cho tier3. */
      tier3: number;
    };
    /** Tỷ lệ phần trăm doanh thu cho công ty (0-1). */
    companyRate: number;
  };
}

export interface CalculateFinancialsResult {
  /** ID kỳ quay. */
  drawId: string;
  /** Tổng doanh thu từ vé cược (VND). */
  totalRevenue: number;
  /** Tổng giải thưởng cố định đã trả (tier3/tier4/tier5) (VND). */
  totalFixedPrizes: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalAgentCommission: number;
  /**
   * Phần lợi nhuận công ty trước điều chỉnh (VND).
   * Công thức: totalRevenue × companyRate.
   */
  companyTake: number;
  /**
   * Phần lợi nhuận công ty thực tế sau trừ giải thưởng cố định (VND).
   * Công thức: companyTake - totalFixedPrizes (nếu dương).
   */
  actualCompanyTake: number;
  /**
   * Đóng góp vào quỹ Jackpot 1 (VND).
   * Công thức: totalRevenue × jp1Ratio.
   */
  jackpot1Contribution: number;
  /**
   * Đóng góp vào quỹ Jackpot 2 (VND).
   * Công thức: totalRevenue × jp2Ratio + jp1Overflow.
   */
  jackpot2Contribution: number;
  /** Phần tràn từ JP1 (vượt jp1OverflowThreshold) chuyển sang JP2 (VND). */
  jp1Overflow: number;
  /** Số dư Jackpot 1 cuối kỳ (VND). Reset về seed nếu có winner hoặc split. */
  closingJp1: number;
  /** Số dư Jackpot 2 cuối kỳ (VND). Reset về seed nếu có winner hoặc split. */
  closingJp2: number;
  /** Số dư Jackpot 1 opening cho kỳ tiếp theo (VND). */
  nextJp1Opening: number;
  /** Số dư Jackpot 2 opening cho kỳ tiếp theo (VND). */
  nextJp2Opening: number;
  /** Có người trúng Jackpot 1 (6/6) hay không. */
  hasJackpot1Winner: boolean;
  /** Có người trúng Jackpot 2 (5/6 + bonus) hay không. */
  hasJackpot2Winner: boolean;
  /** Chi tiết chia giải theo tier (chỉ có khi isSplitCycle = true). */
  splitDetails?: Record<
    string,
    {
      /** Số tiền ban đầu phân bổ cho tier từ tổng split (VND). */
      initialAmount: number;
      /** Số tiền tái phân phối từ tier không có winner (VND). */
      redistributedAmount: number;
      /** Tổng tiền cho tier = initialAmount + redistributedAmount (VND). */
      totalAmount: number;
      /** Số người thắng tier này. */
      winnerCount: number;
      /** Số tiền bonus mỗi người thắng (VND). Công thức: totalAmount / winnerCount. */
      bonusPerWinner: number;
    }
  >;
  /** Chi tiết doanh thu theo từng tenant (đại lý). */
  tenantBreakdown: Array<{
    /** ID tenant. */
    tenantId: string;
    /** Doanh thu từ tenant này (VND). */
    revenue: number;
    /** Hoa hồng cho tenant (VND). */
    commission: number;
    /** Tỷ lệ hoa hồng của tenant (0-1). */
    commissionRate: number;
    /** Số entries từ tenant này. */
    entryCount: number;
  }>;
}

/**
 * Tính tài chính tổng hợp Power 6/55 từ DB.
 * Hỗ trợ dual jackpot: JP1 (6/6) + JP2 (5/6 + bonus).
 */
export class CalculateFinancialsUseCase extends StepFunctionUseCase<
  CalculateFinancialsInput,
  CalculateFinancialsResult
> {
  private readonly entryRepo = new EntryRepository();
  private readonly drawRepo = new DrawRepository();

  /** @inheritdoc */
  protected async execute(
    input: CalculateFinancialsInput
  ): Promise<CalculateFinancialsResult> {
    const { drawId, config, jp1OpeningAmount, jp2OpeningAmount, isSplitCycle } =
      input;

    const [tenantAgg, payoutSummary] = await Promise.all([
      this.entryRepo.aggregateRevenueByTenant(drawId),
      this.entryRepo.aggregateSettledPayoutSummary(drawId),
    ]);

    const financialInput: DrawFinancialInput = {
      totalRevenue: tenantAgg.reduce((sum, t) => sum + t.revenue, 0),
      totalFixedPrizes: payoutSummary.totalFixedPrizes,
      tenantRevenues: tenantAgg.map((t) => ({
        tenantId: t.tenantId,
        revenue: t.revenue,
        commission: t.commission,
        commissionRate: t.commissionRate,
      })),
      companyRate: config.companyRate,
      jp1Ratio: config.jp1Ratio,
      jp2Ratio: config.jp2Ratio,
      jp1OverflowThreshold: config.jp1OverflowThreshold,
      currentJp1Opening: jp1OpeningAmount,
    };

    const fin = calculateDrawFinancials(financialInput);

    const jp1WinnerCount =
      payoutSummary.tierWinnerCounts[PrizeTier.Jackpot1] ?? 0;
    const jp2WinnerCount =
      payoutSummary.tierWinnerCounts[PrizeTier.Jackpot2] ?? 0;
    const hasJackpot1Winner = jp1WinnerCount > 0;
    const hasJackpot2Winner = jp2WinnerCount > 0;

    let splitDetails: CalculateFinancialsResult["splitDetails"];

    if (isSplitCycle) {
      const winnerCountPerTier = new Map<string, number>();
      for (const [tierStr, count] of Object.entries(
        payoutSummary.tierWinnerCounts
      )) {
        if (
          tierStr === PrizeTier.Jackpot1 ||
          tierStr === PrizeTier.Jackpot2
        )
          continue;
        if (count > 0)
          winnerCountPerTier.set(tierStr as any, count);
      }

      const totalSplitAmount = jp1OpeningAmount + jp2OpeningAmount;
      const splitResult = calculateSplitDistribution({
        totalAmount: totalSplitAmount,
        splitRatios: config.splitRatios,
        winnerCountPerTier: winnerCountPerTier as Map<any, number>,
      });

      if (splitResult.details.size > 0) {
        splitDetails = {};
        for (const [tier, detail] of splitResult.details) {
          splitDetails[tier] = {
            initialAmount: detail.initialAmount,
            redistributedAmount: detail.redistributedAmount,
            totalAmount: detail.totalAmount,
            winnerCount: detail.winnerCount,
            bonusPerWinner: detail.bonusPerWinner,
          };
        }
      }
    }

    const closingJp1 =
      hasJackpot1Winner || isSplitCycle
        ? config.jp1SeedAmount
        : jp1OpeningAmount + fin.jackpot1Contribution;

    const closingJp2 =
      hasJackpot2Winner || isSplitCycle
        ? config.jp2SeedAmount
        : jp2OpeningAmount + fin.jackpot2Contribution;

    const nextJp1Opening = calculateNextJackpot1(
      jp1OpeningAmount,
      fin.jackpot1Contribution,
      hasJackpot1Winner,
      config.jp1SeedAmount
    );

    const nextJp2Opening = calculateNextJackpot2(
      jp2OpeningAmount,
      fin.jackpot2Contribution,
      hasJackpot2Winner,
      config.jp2SeedAmount
    );

    const tenantBreakdown = tenantAgg.map((t) => ({
      tenantId: t.tenantId,
      revenue: t.revenue,
      commission: t.commission,
      commissionRate: t.commissionRate,
      entryCount: t.entryCount,
    }));

    await this.drawRepo.updateFinancial(drawId, {
      totalRevenue: fin.totalRevenue,
      totalFixedPrizes: fin.totalFixedPrizes,
      totalAgentCommission: fin.totalAgentCommission,
      companyTake: fin.actualCompanyTake,
      actualCompanyTake: fin.actualCompanyTake,
      jackpot1Contribution: fin.jackpot1Contribution,
      jackpot2Contribution: fin.jackpot2Contribution,
      jp1Overflow: fin.jp1Overflow,
      tenantBreakdown,
    });

    await this.drawRepo.updateStats(drawId, {
      totalEntries: payoutSummary.totalSettled,
      totalLines: input.totalLines,
      totalWinners: 0,
      tierWinners: payoutSummary.tierWinnerCounts,
      totalPayout: payoutSummary.totalPayoutAmount,
    });

    return {
      drawId,
      totalRevenue: fin.totalRevenue,
      totalFixedPrizes: fin.totalFixedPrizes,
      totalAgentCommission: fin.totalAgentCommission,
      companyTake: fin.companyTake,
      actualCompanyTake: fin.actualCompanyTake,
      jackpot1Contribution: fin.jackpot1Contribution,
      jackpot2Contribution: fin.jackpot2Contribution,
      jp1Overflow: fin.jp1Overflow,
      closingJp1,
      closingJp2,
      nextJp1Opening,
      nextJp2Opening,
      hasJackpot1Winner,
      hasJackpot2Winner,
      splitDetails,
      tenantBreakdown,
    };
  }
}
