/**
 * Use Case: Calculate Financials (Max 3D)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * STEP 4 TRONG SETTLE FLOW
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Tính toán tài chính tổng hợp sau khi TẤT CẢ entries đã settled.
 * Max 3D không có Jackpot → không tính jackpotContribution.
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
import { BASIC_PRIZE_TIER_VALUES, type DrawSettleSummary, PLUS_PRIZE_TIER_VALUES } from "@megawin/game-max3d/entities";
import { calculateDrawFinancials, type DrawFinancialInput } from "@megawin/game-max3d/rules/financials";

import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
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
      this.entryRepo.aggregateSettledPayoutSummary(drawId),
    ]);

    const financialInput: DrawFinancialInput = {
      totalRevenue,
      totalFixedPrizes: payoutSummary.totalFixedPrizes,
      totalAgentCommission,
    };

    const fin = calculateDrawFinancials(financialInput);

    // ── Build settleSummary cho player API ─────────────────────────────────
    // Tách riêng 2 bảng: basicTiers (4 hạng) và plusTiers (7 hạng).
    // KHÔNG gộp chung vì 4 tier đầu (special, first, second, third) trùng tên giữa basic và plus
    // nhưng giá trị giải thưởng khác nhau hoàn toàn (e.g. basic special = 1tr, plus special = 1tỷ).
    // Tiers có winnerCount = 0 vẫn được ghi để API luôn trả đủ bảng giải.
    const settleSummary: DrawSettleSummary = {
      basicTiers: BASIC_PRIZE_TIER_VALUES.map((tier) => ({
        tier,
        winnerCount: payoutSummary.basicWinnerCounts[tier] ?? 0,
        prizeAmount: payoutSummary.basicPrizeAmounts[tier] ?? 0,
      })),
      plusTiers: PLUS_PRIZE_TIER_VALUES.map((tier) => ({
        tier,
        winnerCount: payoutSummary.plusWinnerCounts[tier] ?? 0,
        prizeAmount: payoutSummary.plusPrizeAmounts[tier] ?? 0,
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
