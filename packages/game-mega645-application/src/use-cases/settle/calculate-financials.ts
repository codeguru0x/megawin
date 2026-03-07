/**
 * Use Case: Calculate Financials (Mega 6/45)
 *
 * Tính toán tài chính tổng hợp sau khi TẤT CẢ entries đã settled.
 * CRASH-SAFE: Aggregate từ DB. IDEMPOTENT.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { roundTo } from "@megawin/shared/utils/number";
import { PrizeTier } from "@megawin/game-mega645/entities";
import {
  calculateDrawFinancials,
  calculateNextJackpot,
  calculateSplitDistribution,
  type DrawFinancialInput,
} from "@megawin/game-mega645/rules";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { SettleContext, SettleFinancials } from "./types";

export class CalculateFinancialsUseCase extends InternalUseCase<
  SettleContext,
  SettleFinancials
> {
  private readonly entryRepo = new EntryRepository();
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: SettleContext): Promise<SettleFinancials> {
    const { drawId, config, jackpotOpeningAmount, isSplitCycle } = input;

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
      })),
      companyRate: config.companyRate,
    };

    const fin = calculateDrawFinancials(financialInput);

    const jackpotWinnerCount = payoutSummary.tierWinnerCounts[PrizeTier.Jackpot] ?? 0;
    const hasJackpotWinner = jackpotWinnerCount > 0;

    let splitDetails: SettleFinancials["splitDetails"];

    if (isSplitCycle) {
      const winnerCountPerTier = new Map<PrizeTier, number>();
      for (const [tierStr, count] of Object.entries(payoutSummary.tierWinnerCounts)) {
        if (tierStr === PrizeTier.Jackpot) continue;
        if (count > 0) winnerCountPerTier.set(tierStr as PrizeTier, count);
      }

      const splitResult = calculateSplitDistribution({
        jackpotAmount: jackpotOpeningAmount,
        splitRatios: config.splitRatios,
        winnerCountPerTier,
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

    const closingJackpot =
      hasJackpotWinner || isSplitCycle
        ? config.seedAmount
        : jackpotOpeningAmount + fin.jackpotContribution;

    const nextJackpotOpening = calculateNextJackpot(
      jackpotOpeningAmount,
      fin.jackpotContribution,
      hasJackpotWinner,
      config.seedAmount,
    );

    const tenantBreakdown = tenantAgg.map((t) => ({
      tenantId: t.tenantId,
      revenue: t.revenue,
      commission: t.commission,
      commissionRate: t.revenue > 0 ? roundTo(t.commission / t.revenue, 2) : 0,
      entryCount: t.entryCount,
    }));

    await this.drawRepo.updateSettleResult(
      drawId,
      {
        totalRevenue: fin.totalRevenue,
        totalFixedPrizes: fin.totalFixedPrizes,
        totalAgentCommission: fin.totalAgentCommission,
        companyTake: fin.actualCompanyTake,
        companyTakeRate: config.companyRate,
        companyTakeMax: fin.companyTake,
        jackpotContribution: fin.jackpotContribution,
      },
      {
        ticketEntryCount: payoutSummary.totalSettled,
        totalLineCount: input.totalLines,
        totalSalesAmount: fin.totalRevenue,
        totalPayoutAmount: payoutSummary.totalPayoutAmount,
      },
    );

    return {
      totalRevenue: fin.totalRevenue,
      totalFixedPrizes: fin.totalFixedPrizes,
      totalAgentCommission: fin.totalAgentCommission,
      companyTake: fin.companyTake,
      actualCompanyTake: fin.actualCompanyTake,
      jackpotContribution: fin.jackpotContribution,
      closingJackpot,
      nextJackpotOpening,
      hasJackpotWinner,
      splitDetails,
    };
  }
}
