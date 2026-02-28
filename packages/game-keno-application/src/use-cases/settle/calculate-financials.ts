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

import { StepFunctionUseCase } from "@megawin/app-core/use-cases";
import { calculateKenoDrawFinancials } from "@megawin/game-keno/rules";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";

export interface CalculateFinancialsInput {
  drawId: string;
  config: {
    companyRate: number;
  };
}

export interface CalculateFinancialsResult {
  drawId: string;
  totalRevenue: number;
  totalPrizes: number;
  totalAgentCommission: number;
  companyTake: number;
  tenantBreakdown: Array<{
    tenantId: string;
    revenue: number;
    commission: number;
    commissionRate: number;
    entryCount: number;
  }>;
}

export class CalculateFinancialsUseCase extends StepFunctionUseCase<
  CalculateFinancialsInput,
  CalculateFinancialsResult
> {
  private readonly entryRepo = new EntryRepository();
  private readonly drawRepo = new DrawRepository();

  /** Tính tài chính tổng hợp Keno. Idempotent – tính từ DB. */
  protected async execute(
    input: CalculateFinancialsInput
  ): Promise<CalculateFinancialsResult> {
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
        commissionRate: t.commissionRate,
        commission: t.commission,
      })),
      companyRate: config.companyRate,
    });

    const tenantBreakdown = tenantAgg.map((t) => {
      const fb = fin.tenantBreakdown.find((b) => b.tenantId === t.tenantId);
      return {
        tenantId: t.tenantId,
        revenue: t.revenue,
        commission: fb?.commission ?? 0,
        commissionRate: t.commissionRate,
        entryCount: t.entryCount,
      };
    });

    await this.drawRepo.updateFinancial(drawId, {
      totalRevenue: fin.totalRevenue,
      totalPrizes: fin.totalPrizes,
      totalAgentCommission: fin.totalAgentCommission,
      companyTake: fin.companyTake,
    });

    await this.drawRepo.updateStats(drawId, {
      ticketEntryCount: payoutSummary.totalSettled,
      totalSalesAmount: fin.totalRevenue,
      totalPayoutAmount: payoutSummary.totalPayoutAmount,
    });

    return {
      drawId,
      totalRevenue: fin.totalRevenue,
      totalPrizes: fin.totalPrizes,
      totalAgentCommission: fin.totalAgentCommission,
      companyTake: fin.companyTake,
      tenantBreakdown,
    };
  }
}
