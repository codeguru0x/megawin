/**
 * Use Case: Calculate Financials (Keno)
 *
 * Tính toán tài chính tổng hợp sau khi TẤT CẢ entries đã settled.
 *
 * Keno KHÔNG có Jackpot – chỉ tính:
 *   - totalRevenue, totalPrizes
 *   - commission per tenant
 *   - companyTake
 *
 * IDEMPOTENT: Chạy lại cho kết quả giống nhau (tính từ DB).
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { roundTo } from "@megawin/shared/utils/number";
import { calculateKenoDrawFinancials } from "@megawin/game-keno/rules";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { SettleContext, SettleFinancials } from "./types";

export class CalculateFinancialsUseCase extends InternalUseCase<
  SettleContext,
  SettleFinancials
> {
  private readonly entryRepo = new EntryRepository();
  private readonly drawRepo = new DrawRepository();

  /** Tính tài chính tổng hợp Keno. Idempotent – tính từ DB. */
  protected async execute(input: SettleContext): Promise<SettleFinancials> {
    const { drawId, config } = input;

    const [tenantAgg, payoutSummary] = await Promise.all([
      this.entryRepo.aggregateRevenueByTenant(drawId),
      this.entryRepo.aggregateSettledPayoutSummary(drawId),
    ]);

    const fin = calculateKenoDrawFinancials({
      totalRevenue: tenantAgg.reduce((sum, t) => sum + t.revenue, 0),
      totalPrizes: payoutSummary.totalPrizes,
      tenantRevenues: tenantAgg.map((t) => ({
        tenantId: t.tenantId,
        revenue: t.revenue,
        commission: t.commission,
      })),
      companyRate: config.companyRate,
    });

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
        totalPrizes: fin.totalPrizes,
        totalAgentCommission: fin.totalAgentCommission,
        companyTake: fin.companyTake,
      },
      {
        ticketEntryCount: payoutSummary.totalSettled,
        totalSalesAmount: fin.totalRevenue,
        totalPayoutAmount: payoutSummary.totalPayoutAmount,
      },
    );

    return {
      totalRevenue: fin.totalRevenue,
      totalPrizes: fin.totalPrizes,
      totalAgentCommission: fin.totalAgentCommission,
      companyTake: fin.companyTake,
    };
  }
}
