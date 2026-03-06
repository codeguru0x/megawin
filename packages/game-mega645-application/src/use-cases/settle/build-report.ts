/**
 * Use Case: Build Report (Mega 6/45)
 *
 * Tạo/cập nhật báo cáo tài chính hàng ngày.
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
  /** Ngày tài chính (ISO date). */
  financialDate: string;
  /** Số tenant đã ghi nhận báo cáo. */
  tenantsReported: number;
  /** Số player đã ghi nhận báo cáo. */
  playersReported: number;
  /** Đã publish báo cáo lên game-core chưa (chỉ true khi có dữ liệu financials). */
  gameCoreReportPublished: boolean;
}

export class BuildReportUseCase extends InternalUseCase<
  SettleContext,
  BuildReportResult
> {
  private readonly entryRepo = new EntryRepository();
  private readonly reportRepo = new ReportRepository();

  protected async execute(input: SettleContext): Promise<BuildReportResult> {
    const { drawId, financialDate, financials, jackpotOpeningAmount } = input;

    const tenantAggs = await this.entryRepo.aggregateTenantReport(
      drawId,
      financialDate
    );

    for (const t of tenantAggs) {
      await this.reportRepo.upsertTenantDailyReport({
        tenantId: t.tenantId,
        financialDate,
        drawId,
        product: GameProduct.Mega645,
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
        product: GameProduct.Mega645,
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
      const totalPayout = financials.tenantBreakdown.reduce(
        (s, t) =>
          s +
          (tenantAggs.find((a) => a.tenantId === t.tenantId)?.totalPayout ?? 0),
        0
      );
      const totalWin = tenantAggs.reduce((s, t) => s + t.totalWin, 0);

      await publishGameReport({
        gameProduct: GameProduct.Mega645,
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
          jackpotContribution: financials.jackpotContribution,
        },
        jackpotTracking: {
          openingAmount: jackpotOpeningAmount,
          closingAmount: financials.closingJackpot,
          hasJackpotWinner: financials.hasJackpotWinner,
          totalContribution: financials.jackpotContribution,
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
