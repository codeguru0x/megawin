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
  drawId: string;
  jp1OpeningAmount: number;
  jp2OpeningAmount: number;
  isSplitCycle: boolean;
  totalLines: number;
  config: {
    jp1SeedAmount: number;
    jp2SeedAmount: number;
    jp1Ratio: number;
    jp2Ratio: number;
    jp1OverflowThreshold: number;
    splitThreshold: number;
    splitRatios: { tier1: number; tier2: number; tier3: number };
    companyRate: number;
  };
}

export interface CalculateFinancialsResult {
  drawId: string;
  totalRevenue: number;
  totalFixedPrizes: number;
  totalAgentCommission: number;
  companyTake: number;
  actualCompanyTake: number;
  jackpot1Contribution: number;
  jackpot2Contribution: number;
  jp1Overflow: number;
  closingJp1: number;
  closingJp2: number;
  nextJp1Opening: number;
  nextJp2Opening: number;
  hasJackpot1Winner: boolean;
  hasJackpot2Winner: boolean;
  splitDetails?: Record<
    string,
    {
      initialAmount: number;
      redistributedAmount: number;
      totalAmount: number;
      winnerCount: number;
      bonusPerWinner: number;
    }
  >;
  tenantBreakdown: Array<{
    tenantId: string;
    revenue: number;
    commission: number;
    commissionRate: number;
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
