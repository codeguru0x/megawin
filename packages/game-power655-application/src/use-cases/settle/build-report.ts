/**
 * Use Case: Build Report (Power 6/55)
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
import type { SettleContext } from "./types";

export interface BuildReportResult {
  /** ID kỳ quay đã tạo báo cáo. */
  drawId: string;
  /** Ngày tài chính của báo cáo (YYYY-MM-DD). */
  financialDate: string;
  /** Số tenant đã tạo báo cáo. */
  tenantsReported: number;
  /** Số player đã tạo báo cáo. */
  playersReported: number;
  /** Đã publish báo cáo lên game-core (dashboard chung) chưa. */
  gameCoreReportPublished: boolean;
}

/**
 * Tạo/cập nhật báo cáo tài chính Power 6/55.
 * Upsert pattern – idempotent.
 */
export class BuildReportUseCase extends InternalUseCase<
  SettleContext,
  BuildReportResult
> {
  private readonly entryRepo = new EntryRepository();
  private readonly reportRepo = new ReportRepository();

  /** @inheritdoc */
  protected async execute(
    input: SettleContext
  ): Promise<BuildReportResult> {
    const { drawId, financialDate, financials, jp1OpeningAmount, jp2OpeningAmount } = input;

    const tenantAggs = await this.entryRepo.aggregateTenantReport(
      drawId,
      financialDate
    );

    for (const t of tenantAggs) {
      await this.reportRepo.upsertTenantDailyReport({
        tenantId: t.tenantId,
        financialDate,
        drawId,
        product: GameProduct.Power655,
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
        product: GameProduct.Power655,
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
      const totalJackpotContribution =
        financials.jackpot1Contribution + financials.jackpot2Contribution;

      await publishGameReport({
        gameProduct: GameProduct.Power655,
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
          jackpotContribution: totalJackpotContribution,
        },
        jackpotTracking: {
          openingAmount: jp1OpeningAmount + jp2OpeningAmount,
          closingAmount: financials.closingJp1 + financials.closingJp2,
          hasJackpotWinner:
            financials.hasJackpot1Winner || financials.hasJackpot2Winner,
          totalContribution: totalJackpotContribution,
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
