/**
 * Use Case: Calculate Financials (Max 3D Pro)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * STEP 4 TRONG SETTLE FLOW
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Tính toán tài chính tổng hợp sau khi TẤT CẢ entries đã settled.
 * Max 3D Pro không có Jackpot → không tính jackpotContribution.
 *
 * CRASH-SAFE DESIGN:
 *   - KHÔNG dựa vào accumulator từ step function
 *   - Aggregate TẤT CẢ settled entries từ DB
 *   - Tính commission, companyTake từ rules
 *   - Ghi draw.financial + draw.settleSummary (bảng giải cho player API)
 *
 * IDEMPOTENT: Chạy lại bao nhiêu lần cũng cho kết quả giống nhau.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { PRIZE_TIER_VALUES } from "@megawin/game-max3dpro/entities";
import { calculateDrawFinancials, type DrawFinancialInput } from "@megawin/game-max3dpro/rules/financials";

import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { DrawSettleSummary } from "../../infras/repos/types/draw.types";
import type { SettleContext, SettleFinancials } from "./types";

export class CalculateFinancialsUseCase extends InternalUseCase<SettleContext, SettleFinancials> {
  private readonly entryRepo = new EntryRepository();
  private readonly drawRepo = new DrawRepository();

  /**
   * Tính tài chính tổng hợp từ DB và ghi settleSummary cho player API.
   * Idempotent — ghi đè nếu chạy lại.
   */
  protected async execute(input: SettleContext): Promise<SettleFinancials> {
    const { drawId } = input;

    const [{ totalRevenue, totalAgentCommission }, payoutSummary] = await Promise.all([
      this.entryRepo.aggregateTotalRevenue(drawId),
      this.entryRepo.aggregateSettledSummary(drawId),
    ]);

    const financialInput: DrawFinancialInput = {
      totalRevenue,
      totalFixedPrizes: payoutSummary.totalFixedPrizes,
      totalAgentCommission,
    };

    const fin = calculateDrawFinancials(financialInput);

    // ── Build settleSummary cho player API ─────────────────────────────────
    // Max 3D Pro có 8 hạng giải (special, specialSub, first ... sixth).
    // Tiers có winnerCount = 0 vẫn được ghi để API luôn trả đủ bảng giải.
    const settleSummary: DrawSettleSummary = {
      tiers: PRIZE_TIER_VALUES.map((tier) => ({
        tier,
        winnerCount: payoutSummary.tierWinnerCounts[tier] ?? 0,
        prizeAmount: payoutSummary.tierPrizeAmounts[tier] ?? 0,
      })),
    };

    await this.drawRepo.updateSettleResult(
      drawId,
      {
        totalRevenue: fin.totalRevenue,
        totalFixedPrizes: fin.totalFixedPrizes,
        totalAgentCommission: fin.totalAgentCommission,
        companyTake: fin.companyTake,
      },
      {
        ticketEntryCount: payoutSummary.totalSettled,
        totalLineCount: payoutSummary.totalLines,
        totalSalesAmount: fin.totalRevenue,
        totalPayoutAmount: payoutSummary.totalPayoutAmount,
      },
      settleSummary,
    );

    return {
      totalRevenue: fin.totalRevenue,
      totalFixedPrizes: fin.totalFixedPrizes,
      totalAgentCommission: fin.totalAgentCommission,
      companyTake: fin.companyTake,
    };
  }
}
