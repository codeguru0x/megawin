/**
 * Use Case: Build Report (Keno)
 *
 * Tạo/cập nhật báo cáo tài chính hàng ngày.
 * Keno KHÔNG có Jackpot → jackpotTracking = undefined.
 */

import { StepFunctionUseCase } from "@megawin/app-core/use-cases";
import { GameProduct } from "@megawin/game-core/entities";
import { publishGameReport } from "@megawin/game-core-application/use-cases";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { ReportRepository } from "../../infras/repos/report-repo";

export interface BuildReportInput {
  drawId: string;
  financialDate: string;
  financials?: {
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
  };
}

export interface BuildReportResult {
  drawId: string;
  financialDate: string;
  tenantsReported: number;
  playersReported: number;
  gameCoreReportPublished: boolean;
}

export class BuildReportUseCase extends StepFunctionUseCase<
  BuildReportInput,
  BuildReportResult
> {
  private readonly entryRepo = new EntryRepository();
  private readonly reportRepo = new ReportRepository();

  /** Tạo/cập nhật báo cáo Keno. Upsert – idempotent. */
  protected async execute(input: BuildReportInput): Promise<BuildReportResult> {
  const { drawId, financialDate, financials } = input;
  const tenantAggs = await this.entryRepo.aggregateTenantReport(drawId, financialDate);

  for (const t of tenantAggs) {
    await this.reportRepo.upsertTenantDailyReport({
      tenantId: t.tenantId,
      financialDate,
      drawId,
      product: GameProduct.Keno,
      revenue: t.totalStake,
      commission: Math.round(t.totalStake * t.commissionRate),
      commissionRate: t.commissionRate,
      totalStake: t.totalStake,
      totalPayout: t.totalPayout,
      totalWin: t.totalWin,
      entryCount: t.entryCount,
      ggr: t.totalStake - t.totalPayout,
      netRevenue: t.totalStake - Math.round(t.totalStake * t.commissionRate),
    });
  }

  const playerAggs = await this.entryRepo.aggregatePlayerReport(drawId, financialDate);

  for (const p of playerAggs) {
    await this.reportRepo.upsertPlayerDailyReport({
      tenantId: p.tenantId,
      playerId: p.playerId,
      financialDate,
      drawId,
      product: GameProduct.Keno,
      totalStake: p.totalStake,
      totalWin: p.totalWin,
      totalPayout: p.totalPayout,
      entryCount: p.entryCount,
      netAmount: p.totalStake - p.totalPayout,
    });
  }

  let gameCoreReportPublished = false;

  if (financials) {
    const totalStake = financials.totalRevenue;
    const totalPayout = tenantAggs.reduce((s, t) => s + t.totalPayout, 0);
    const totalWin = tenantAggs.reduce((s, t) => s + t.totalWin, 0);

    await publishGameReport({
      gameProduct: GameProduct.Keno,
      drawId,
      financialDate,
      tenantReports: tenantAggs.map((t) => ({
        tenantId: t.tenantId,
        totalStake: t.totalStake,
        totalPayout: t.totalPayout,
        totalWin: t.totalWin,
        commission: Math.round(t.totalStake * t.commissionRate),
        commissionRate: t.commissionRate,
        entryCount: t.entryCount,
      })),
      companyFinancials: {
        totalStake,
        totalPayout,
        totalWin,
        totalCommission: financials.totalAgentCommission,
        companyTake: financials.companyTake,
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
