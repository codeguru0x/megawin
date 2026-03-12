/**
 * Use Case: Build Report (Bingo 18)
 *
 * Tạo/cập nhật báo cáo tài chính hàng ngày.
 * Bingo 18 KHÔNG có Jackpot → jackpotTracking = undefined.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { GameProduct } from "@megawin/game-core/entities";
import { publishGameReport } from "@megawin/game-core-application/use-cases";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { ReportRepository } from "../../infras/repos/report-repo";
import type { SettleContext } from "./types";

export interface BuildReportResult {
  /** ID kỳ quay. */
  drawId: string;
  /** Ngày tài chính (YYYY-MM-DD). */
  financialDate: string;
  /** Số tenant đã ghi báo cáo. */
  tenantsReported: number;
  /** Số player đã ghi báo cáo. */
  playersReported: number;
  /** true nếu đã publish báo cáo lên game-core. */
  gameCoreReportPublished: boolean;
}

export class BuildReportUseCase extends InternalUseCase<SettleContext, BuildReportResult> {
  private readonly entryRepo = new EntryRepository();
  private readonly reportRepo = new ReportRepository();

  protected async execute(input: SettleContext): Promise<BuildReportResult> {
    const { drawId, financialDate, financials } = input;
    const tenantAggs = await this.entryRepo.aggregateTenantReport(drawId, financialDate);

    for (const t of tenantAggs) {
      await this.reportRepo.upsertTenantDailyReport({
        tenantId: t.tenantId,
        financialDate,
        drawId,
        product: GameProduct.Bingo18,
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

    const playerAggs = await this.entryRepo.aggregatePlayerReport(drawId, financialDate);

    for (const p of playerAggs) {
      await this.reportRepo.upsertPlayerDailyReport({
        tenantId: p.tenantId,
        accountId: p.accountId,
        financialDate,
        drawId,
        product: GameProduct.Bingo18,
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
        gameProduct: GameProduct.Bingo18,
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
