/**
 * Use Case: Build Report (Max 3D Pro)
 *
 * Tạo/cập nhật báo cáo tài chính hàng ngày:
 *   - Per tenant per drawId per financialDate (game-specific)
 *   - Per player per tenant per drawId per financialDate (game-specific)
 *   - Publish lên game-core gameDailyReports (báo cáo chung cho dashboard)
 *
 * Dùng MongoDB aggregation pipeline (server-side) – không load entries vào memory.
 * Upsert pattern: idempotent khi chạy lại.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { GameProduct } from "@megawin/game-core/entities";
import { publishGameReport } from "@megawin/game-core-application/use-cases";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { ReportRepository } from "../../infras/repos/report-repo";

export interface BuildReportInput {
  /** ID kỳ quay. */
  drawId: string;
  /** Ngày tài chính (YYYY-MM-DD). */
  financialDate: string;
  /** Dữ liệu tài chính từ bước calculate-financials (optional nếu không có entries). */
  financials?: {
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
  };
}

export interface BuildReportResult {
  /** ID kỳ quay. */
  drawId: string;
  /** Ngày tài chính. */
  financialDate: string;
  /** Số tenant đã tạo báo cáo. */
  tenantsReported: number;
  /** Số player đã tạo báo cáo. */
  playersReported: number;
  /** true nếu đã publish lên game-core dashboard. */
  gameCoreReportPublished: boolean;
}

export class BuildReportUseCase extends InternalUseCase<
  BuildReportInput,
  BuildReportResult
> {
  private readonly entryRepo = new EntryRepository();
  private readonly reportRepo = new ReportRepository();

  protected async execute(input: BuildReportInput): Promise<BuildReportResult> {
    const { drawId, financialDate, financials } = input;

    // Step 1: Game-specific tenant report (max3dProDailyReports)
    const tenantAggs = await this.entryRepo.aggregateTenantReport(
      drawId,
      financialDate
    );

    for (const t of tenantAggs) {
      await this.reportRepo.upsertTenantDailyReport({
        tenantId: t.tenantId,
        financialDate,
        drawId,
        product: GameProduct.Max3dpro,
        revenue: t.totalStake,
        commission: t.totalCommission,
        commissionRate: t.commissionRate,
        totalStake: t.totalStake,
        totalPayout: t.totalPayout,
        totalWin: t.totalWin,
        entryCount: t.entryCount,
        ggr: t.totalStake - t.totalPayout,
        netRevenue: t.totalStake - t.totalCommission,
      });
    }

    // Step 2: Game-specific player report
    const playerAggs = await this.entryRepo.aggregatePlayerReport(
      drawId,
      financialDate
    );

    for (const p of playerAggs) {
      await this.reportRepo.upsertPlayerDailyReport({
        tenantId: p.tenantId,
        accountId: p.accountId,
        financialDate,
        drawId,
        product: GameProduct.Max3dpro,
        totalStake: p.totalStake,
        totalWin: p.totalWin,
        totalPayout: p.totalPayout,
        entryCount: p.entryCount,
        netAmount: p.totalStake - p.totalPayout,
      });
    }

    // Step 3: Publish lên game-core gameDailyReports (cho dashboard chung)
    let gameCoreReportPublished = false;

    if (financials) {
      const totalStake = financials.totalRevenue;
      const totalPayout = tenantAggs.reduce((s, t) => s + t.totalPayout, 0);
      const totalWin = tenantAggs.reduce((s, t) => s + t.totalWin, 0);

      await publishGameReport({
        gameProduct: GameProduct.Max3dpro,
        drawId,
        financialDate,
        tenantReports: tenantAggs.map((t) => ({
          tenantId: t.tenantId,
          totalStake: t.totalStake,
          totalPayout: t.totalPayout,
          totalWin: t.totalWin,
          commission: t.totalCommission,
          commissionRate: t.commissionRate,
          entryCount: t.entryCount,
        })),
        companyFinancials: {
          totalStake,
          totalPayout,
          totalWin,
          totalCommission: financials.totalAgentCommission,
          companyTake: financials.actualCompanyTake,
          jackpotContribution: 0,
        },
      });

      gameCoreReportPublished = true;
    }

    return {
      drawId,
      financialDate,
      tenantsReported: tenantAggs.length,
      playersReported: playerAggs.length,
      gameCoreReportPublished,
    };
  }
}
