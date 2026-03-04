/**
 * Use Case: Calculate Financials
 *
 * Tính toán tài chính tổng hợp sau khi TẤT CẢ entries đã settled.
 *
 * CRASH-SAFE DESIGN:
 *   - KHÔNG dựa vào accumulator từ step function (có thể sai/mất khi crash)
 *   - Aggregate TẤT CẢ settled entries từ DB để tính:
 *     + totalFixedPrizes, tierWinnerCounts (từ payout.tiers)
 *     + revenue + commission per tenant (từ entries, dùng commission.amount đã tính sẵn)
 *   - Tính commission, companyTake, jackpotContribution từ rules
 *   - Ghi draw.financial (jackpot snapshot ghi ở finalize-settle)
 *
 * IDEMPOTENT: Chạy lại bao nhiêu lần cũng cho kết quả giống nhau
 * (vì tính từ settled entries trong DB, overwrite draw.financial).
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { PrizeTier } from "@megawin/game-lotto535/entities";
import {
  calculateDrawFinancials,
  calculateNextJackpot,
  calculateSplitDistribution,
  type DrawFinancialInput,
} from "@megawin/game-lotto535/rules";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { LottoSettleConfig, LottoSettleFinancials } from "./types";

export interface CalculateFinancialsInput {
  /** Mã kỳ quay cần tính tài chính. */
  drawId: string;
  /** Số tiền Jackpot đầu kỳ (VND) — từ PrepareSettle. */
  jackpotOpeningAmount: number;
  /** Kỳ này có phải kỳ chia Jackpot hay không. */
  isSplitCycle: boolean;
  /** Tổng lines trong kỳ — dùng ghi stats. */
  totalLines: number;
  /** Cấu hình tài chính (snapshot từ GlobalConfig). */
  config: Pick<LottoSettleConfig, "seedAmount" | "splitThreshold" | "splitRatios" | "companyRate">;
}

export interface CalculateFinancialsResult extends LottoSettleFinancials {
  /** Mã kỳ quay. */
  drawId: string;
}

export class CalculateFinancialsUseCase extends InternalUseCase<
  CalculateFinancialsInput,
  CalculateFinancialsResult
> {
  private readonly entryRepo = new EntryRepository();
  private readonly drawRepo = new DrawRepository();

  /** Tính tài chính tổng hợp từ DB. Idempotent. */
  protected async execute(input: CalculateFinancialsInput): Promise<CalculateFinancialsResult> {
    const { drawId, config, jackpotOpeningAmount, isSplitCycle } = input;
    /**
     * CRASH-SAFE: Tính từ DB thay vì accumulator.
     * aggregateSettledPayoutSummary() query tất cả settled entries
     * → tính totalFixedPrizes + tierWinnerCounts chính xác.
     */
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

    let splitDetails: CalculateFinancialsResult["splitDetails"];

    if (isSplitCycle) {
      const winnerCountPerTier = new Map<PrizeTier, number>();
      for (const [tierStr, count] of Object.entries(payoutSummary.tierWinnerCounts)) {
        if (tierStr === PrizeTier.Jackpot || tierStr === PrizeTier.Consolation) continue;
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

    /**
     * Jackpot cuối kỳ:
     * - Có winner hoặc split → reset về seed
     * - Không winner → opening + contribution (tích luỹ)
     */
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
      commissionRate: t.revenue > 0 ? t.commission / t.revenue : 0,
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
      drawId,
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
      tenantBreakdown,
    };
  }
}
