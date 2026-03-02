/**
 * Use Case: Calculate Financials (Max 3D Pro)
 *
 * Tính toán tài chính tổng hợp sau khi TẤT CẢ entries đã settled.
 * Max 3D Pro không có Jackpot → không tính jackpotContribution.
 *
 * CRASH-SAFE DESIGN:
 *   - KHÔNG dựa vào accumulator từ step function
 *   - Aggregate TẤT CẢ settled entries từ DB
 *   - Tính commission, companyTake từ rules
 *   - Ghi draw.financial
 *
 * IDEMPOTENT: Chạy lại bao nhiêu lần cũng cho kết quả giống nhau.
 */

import { StepFunctionUseCase } from "@megawin/app-core/use-cases";
import {
  calculateDrawFinancials,
  type DrawFinancialInput,
} from "@megawin/game-max3dpro/rules/financials";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";

export interface CalculateFinancialsInput {
  /** ID kỳ quay. */
  drawId: string;
  /** Tổng pairs trong kỳ (dùng cập nhật stats). */
  totalLines: number;
  /** Cấu hình tài chính. */
  config: {
    /** Tỷ lệ công ty (% doanh thu). */
    companyRate: number;
  };
}

export interface CalculateFinancialsResult {
  /** ID kỳ quay. */
  drawId: string;
  /** Tổng doanh thu (VND). */
  totalRevenue: number;
  /** Tổng giải thưởng cố định đã trả (VND). */
  totalFixedPrizes: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalAgentCommission: number;
  /** Phần công ty theo tỷ lệ = totalRevenue × companyRate (VND). */
  companyTake: number;
  /** Phần công ty thực tế = totalRevenue − totalFixedPrizes − totalAgentCommission (VND). */
  actualCompanyTake: number;
  /** Lợi nhuận = actualCompanyTake (VND). */
  profit: number;
  /** Chi tiết tài chính theo từng tenant. */
  tenantBreakdown: Array<{
    /** ID tenant. */
    tenantId: string;
    /** Doanh thu từ tenant (VND). */
    revenue: number;
    /** Hoa hồng đại lý (VND). */
    commission: number;
    /** Tỷ lệ hoa hồng (0-1). */
    commissionRate: number;
    /** Số entries của tenant. */
    entryCount: number;
  }>;
}

export class CalculateFinancialsUseCase extends StepFunctionUseCase<
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
    };

    const fin = calculateDrawFinancials(financialInput);

    await this.drawRepo.updateFinancial(drawId, {
      totalRevenue: fin.totalRevenue,
      totalFixedPrizes: fin.totalFixedPrizes,
      totalAgentCommission: fin.totalAgentCommission,
      companyTake: fin.actualCompanyTake,
      companyTakeRate: config.companyRate,
      companyTakeMax: fin.companyTake,
    });

    await this.drawRepo.updateStats(drawId, {
      ticketEntryCount: payoutSummary.totalSettled,
      totalLineCount: input.totalLines,
      totalSalesAmount: fin.totalRevenue,
      totalPayoutAmount: payoutSummary.totalPayoutAmount,
    });

    const tenantBreakdown = tenantAgg.map((t) => ({
      tenantId: t.tenantId,
      revenue: t.revenue,
      commission: t.commission,
      commissionRate: t.commissionRate,
      entryCount: t.entryCount,
    }));

    return {
      drawId,
      totalRevenue: fin.totalRevenue,
      totalFixedPrizes: fin.totalFixedPrizes,
      totalAgentCommission: fin.totalAgentCommission,
      companyTake: fin.companyTake,
      actualCompanyTake: fin.actualCompanyTake,
      profit: fin.profit,
      tenantBreakdown,
    };
  }
}
