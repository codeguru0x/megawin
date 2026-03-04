/**
 * Use Case: Build Report
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
import type { LottoSettleFinancials } from "./types";

export interface BuildReportInput {
  /** Mã kỳ quay cần tạo báo cáo. */
  drawId: string;
  /** Ngày tài chính (YYYY-MM-DD) — key phân nhóm báo cáo. */
  financialDate: string;
  /** Dữ liệu tài chính tổng hợp — truyền từ CalculateFinancials (optional cho void draw). */
  financials?: LottoSettleFinancials;
}

export interface BuildReportResult {
  /** Mã kỳ quay. */
  drawId: string;
  /** Ngày tài chính (YYYY-MM-DD). */
  financialDate: string;
  /** Số tenant đã tạo/cập nhật báo cáo. */
  tenantsReported: number;
  /** Số player đã tạo/cập nhật báo cáo. */
  playersReported: number;
  /** Đã publish báo cáo lên game-core (cho dashboard chung) hay chưa. */
  gameCoreReportPublished: boolean;
}

export class BuildReportUseCase extends InternalUseCase<
  BuildReportInput,
  BuildReportResult
> {
  private readonly entryRepo = new EntryRepository();
  private readonly reportRepo = new ReportRepository();

  /** Tạo/cập nhật báo cáo. Upsert pattern – idempotent. */
  protected async execute(input: BuildReportInput): Promise<BuildReportResult> {
    const { drawId, financialDate, financials } = input;
    // Step 1: Game-specific tenant report (lotto535DailyReports)
    const tenantAggs = await this.entryRepo.aggregateTenantReport(
      drawId,
      financialDate
    );

    for (const t of tenantAggs) {
      await this.reportRepo.upsertTenantDailyReport({
        tenantId: t.tenantId,
        financialDate,
        drawId,
        product: GameProduct.Lotto535,
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

    // Step 2: Game-specific player report (lotto535DailyReports)
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
        product: GameProduct.Lotto535,
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
      const totalPayout = financials.tenantBreakdown.reduce(
        (s, t) =>
          s +
          (tenantAggs.find((a) => a.tenantId === t.tenantId)?.totalPayout ?? 0),
        0
      );
      const totalWin = tenantAggs.reduce((s, t) => s + t.totalWin, 0);

      await publishGameReport({
        gameProduct: GameProduct.Lotto535,
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
          openingAmount:
            financials.closingJackpot - financials.jackpotContribution,
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
