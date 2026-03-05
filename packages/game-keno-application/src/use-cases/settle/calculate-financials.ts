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
import type { KenoSettleConfig, KenoSettleFinancials } from "./types";

export interface CalculateFinancialsInput {
  drawId: string;
  config: Pick<KenoSettleConfig, "companyRate">;
}

export type CalculateFinancialsResult = KenoSettleFinancials & {
  drawId: string;
};

export class CalculateFinancialsUseCase extends InternalUseCase<
  CalculateFinancialsInput,
  CalculateFinancialsResult
> {
  private readonly entryRepo = new EntryRepository();
  private readonly drawRepo = new DrawRepository();

  /** Tính tài chính tổng hợp Keno. Idempotent – tính từ DB. */
  protected async execute(input: CalculateFinancialsInput): Promise<CalculateFinancialsResult> {
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

    const tenantBreakdown = tenantAgg.map((t) => {
      const fb = fin.tenantBreakdown.find((b) => b.tenantId === t.tenantId);
      return {
        tenantId: t.tenantId,
        revenue: t.revenue,
        commission: fb?.commission ?? 0,
        commissionRate: t.revenue > 0 ? roundTo(t.commission / t.revenue, 2) : 0,
        entryCount: t.entryCount,
      };
    });

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
      drawId,
      totalRevenue: fin.totalRevenue,
      totalPrizes: fin.totalPrizes,
      totalAgentCommission: fin.totalAgentCommission,
      companyTake: fin.companyTake,
      tenantBreakdown,
    };
  }
}
