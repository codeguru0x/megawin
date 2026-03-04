/**
 * Use Case: Calculate Financials (Bingo 18)
 *
 * Tính toán tài chính tổng hợp sau khi TẤT CẢ entries đã settled.
 *
 * Bingo 18 KHÔNG có Jackpot, KHÔNG có payout caps – chỉ tính:
 *   - totalRevenue, totalPrizes
 *   - commission per tenant
 *   - companyTake
 *
 * IDEMPOTENT: Chạy lại cho kết quả giống nhau (tính từ DB).
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { calculateBingo18DrawFinancials } from "@megawin/game-bingo18/rules";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";

export interface CalculateFinancialsInput {
  /** ID kỳ quay cần tính tài chính. */
  drawId: string;
  /** Cấu hình tỷ lệ tài chính. */
  config: {
    /** Tỷ lệ công ty (0-1). companyTake = totalRevenue × companyRate - totalPrizes - totalAgentCommission. */
    companyRate: number;
  };
}

export interface CalculateFinancialsResult {
  /** ID kỳ quay. */
  drawId: string;
  /** Tổng doanh thu (VND) = Σ(entry.amount) qua tất cả entries. */
  totalRevenue: number;
  /** Tổng tiền giải thưởng (VND) = Σ(entry.payoutAmount) của entries thắng. */
  totalPrizes: number;
  /** Tổng hoa hồng đại lý (VND) = Σ(tenant.revenue × tenant.commissionRate). */
  totalAgentCommission: number;
  /** Lợi nhuận công ty (VND) = totalRevenue × companyRate - totalPrizes - totalAgentCommission. */
  companyTake: number;
  /** Chi tiết tài chính từng tenant. */
  tenantBreakdown: Array<{
    /** ID tenant. */
    tenantId: string;
    /** Doanh thu tenant (VND) = Σ(entries.amount) của tenant. */
    revenue: number;
    /** Hoa hồng tenant (VND) = revenue × commissionRate. */
    commission: number;
    /** Tỷ lệ hoa hồng tenant (0-1). */
    commissionRate: number;
    /** Số entries của tenant trong kỳ. */
    entryCount: number;
  }>;
}

export class CalculateFinancialsUseCase extends InternalUseCase<
  CalculateFinancialsInput,
  CalculateFinancialsResult
> {
  private readonly entryRepo = new EntryRepository();
  private readonly drawRepo = new DrawRepository();

  protected async execute(
    input: CalculateFinancialsInput
  ): Promise<CalculateFinancialsResult> {
    const { drawId, config } = input;
    const [tenantAgg, payoutSummary] = await Promise.all([
      this.entryRepo.aggregateRevenueByTenant(drawId),
      this.entryRepo.aggregateSettledPayoutSummary(drawId),
    ]);

    const fin = calculateBingo18DrawFinancials({
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
