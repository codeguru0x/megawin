/**
 * Use Case: Publish Game Report
 *
 * Use case CHUNG cho tất cả game – gọi sau khi game-specific settle hoàn tất.
 *
 * Nhận dữ liệu tài chính từ game cụ thể (lotto535, keno, max3d...)
 * và ghi vào collection chung gameDailyReports:
 *   1. game_draw:     per tenant × per draw
 *   2. game_daily:    per tenant × per game × per date (aggregate)
 *   3. company_daily: per game × per date (aggregate + jackpot tracking)
 *
 * Idempotent: tất cả method dùng upsert pattern.
 *
 * FLOW:
 *   Game settle → game-specific build-report → publishGameReport
 *   → gameDailyReports collection → Dashboard backoffice
 */

import type { GameProduct } from "@megawin/game-core/entities";
import { GameDailyReportRepository } from "../infras/repos/game-daily-report-repo";

export interface PublishGameReportInput {
  gameProduct: GameProduct;
  drawId: string;
  financialDate: string;

  tenantReports: Array<{
    tenantId: string;
    totalStake: number;
    totalPayout: number;
    totalWin: number;
    commission: number;
    commissionRate: number;
    entryCount: number;
  }>;

  companyFinancials: {
    totalStake: number;
    totalPayout: number;
    totalWin: number;
    totalCommission: number;
    companyTake: number;
    jackpotContribution: number;
  };

  jackpotTracking?: {
    openingAmount: number;
    closingAmount: number;
    hasJackpotWinner: boolean;
    totalContribution: number;
  };
}

export interface PublishGameReportResult {
  gameProduct: GameProduct;
  financialDate: string;
  drawId: string;
  tenantsPublished: number;
}

/** Singleton — reuse across lambda invocations. */
let reportRepo: GameDailyReportRepository | null = null;
function getReportRepo(): GameDailyReportRepository {
  if (!reportRepo) reportRepo = new GameDailyReportRepository();
  return reportRepo;
}

export async function publishGameReport(
  input: PublishGameReportInput,
): Promise<PublishGameReportResult> {
  const { gameProduct, drawId, financialDate, tenantReports, companyFinancials, jackpotTracking } = input;
  const repo = getReportRepo();

  for (const t of tenantReports) {
    await repo.upsertGameDrawReport({
      tenantId: t.tenantId,
      gameProduct,
      drawId,
      financialDate,
      totalStake: t.totalStake,
      totalPayout: t.totalPayout,
      totalWin: t.totalWin,
      ggr: t.totalStake - t.totalPayout,
      commission: t.commission,
      commissionRate: t.commissionRate,
      netRevenue: t.totalStake - t.commission,
      entryCount: t.entryCount,
    });
  }

  const uniqueTenants = [...new Set(tenantReports.map((t) => t.tenantId))];
  for (const tenantId of uniqueTenants) {
    await repo.upsertGameDailyReport(tenantId, gameProduct, financialDate);
  }

  await repo.upsertCompanyDailyReport({
    gameProduct,
    financialDate,
    totalStake: companyFinancials.totalStake,
    totalPayout: companyFinancials.totalPayout,
    totalWin: companyFinancials.totalWin,
    ggr: companyFinancials.totalStake - companyFinancials.totalPayout,
    totalCommission: companyFinancials.totalCommission,
    netRevenue: companyFinancials.totalStake - companyFinancials.totalCommission,
    entryCount: tenantReports.reduce((s, t) => s + t.entryCount, 0),
    companyTake: companyFinancials.companyTake,
    jackpotContribution: companyFinancials.jackpotContribution,
    drawCount: 1,
    tenantCount: uniqueTenants.length,
    jackpotTracking,
  });

  return {
    gameProduct,
    financialDate,
    drawId,
    tenantsPublished: uniqueTenants.length,
  };
}
