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
import { roundTo } from "@megawin/shared/utils/number";
import {
  calculateDrawFinancials,
  type DrawFinancialInput,
} from "@megawin/game-max3d/rules/financials";
import {
  BasicPrizeTier,
  BASIC_PRIZE_TIER_VALUES,
  PlusPrizeTier,
  PLUS_PRIZE_TIER_VALUES,
} from "@megawin/game-max3d/entities";
import type { DrawSettleSummary } from "@megawin/game-max3d-core/repos";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { SettleContext, SettleFinancials } from "./types";

export class CalculateFinancialsUseCase extends InternalUseCase<
  SettleContext,
  SettleFinancials
> {
  private readonly entryRepo = new EntryRepository();
  private readonly drawRepo = new DrawRepository();

  /**
   * Tính tài chính tổng hợp từ DB và ghi settleSummary cho player API.
   * Idempotent — ghi đè nếu chạy lại.
   */
  protected async execute(input: SettleContext): Promise<SettleFinancials> {
    const { drawId, totalLines } = input;

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
    };

    const fin = calculateDrawFinancials(financialInput);

    // ── Build settleSummary cho player API ─────────────────────────────────
    // Gộp tất cả tiers từ cả basic (4) lẫn plus (7) mode vào 1 bảng.
    // Tiers có winnerCount = 0 vẫn được ghi để API luôn trả đủ bảng giải.
    const allTiers = Array.from(
      new Set([...BASIC_PRIZE_TIER_VALUES, ...PLUS_PRIZE_TIER_VALUES]),
    );
    const settleSummary: DrawSettleSummary = {
      tiers: allTiers.map((tier) => ({
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
        companyTake: fin.profit,
      },
      {
        ticketEntryCount: payoutSummary.totalSettled,
        totalLineCount: totalLines,
        totalSalesAmount: fin.totalRevenue,
        totalPayoutAmount: payoutSummary.totalPayoutAmount,
      },
      settleSummary,
    );

    const tenantBreakdown = tenantAgg.map((t) => ({
      tenantId: t.tenantId,
      revenue: t.revenue,
      commission: t.commission,
      commissionRate: t.revenue > 0 ? roundTo(t.commission / t.revenue, 2) : 0,
      entryCount: t.entryCount,
    }));

    return {
      totalRevenue: fin.totalRevenue,
      totalFixedPrizes: fin.totalFixedPrizes,
      totalAgentCommission: fin.totalAgentCommission,
      profit: fin.profit,
    };
  }
}
