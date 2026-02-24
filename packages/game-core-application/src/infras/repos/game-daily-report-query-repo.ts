/**
 * Game Core – Game Daily Report Query Repository (Read)
 *
 * Collection: gameDailyReports
 *
 * Query báo cáo cho dashboard backoffice.
 * Tách khỏi write repo để:
 *   - Mỗi file ngắn, dễ đọc
 *   - Write path (settle) và read path (dashboard) test độc lập
 *   - Backoffice chỉ import file này, không kéo theo write logic
 */

import type { BaseEntity } from "@megawin/data/mongo/base-entity";
import type { GameProduct } from "@megawin/game-core/entities";
import { GAME_DAILY_REPORT_COLLECTION } from "@megawin/game-core/entities";
import { GameCoreBaseRepo } from "./game-core-base-repo";

export interface DashboardSummary {
  gameProduct: GameProduct;
  financialDate: string;
  totalStake: number;
  totalPayout: number;
  ggr: number;
  totalCommission: number;
  companyTake: number;
  jackpotContribution: number;
  entryCount: number;
  drawCount: number;
  tenantCount: number;
}

export interface TenantDailySummary {
  tenantId: string;
  totalStake: number;
  totalPayout: number;
  ggr: number;
  commission: number;
  netRevenue: number;
  entryCount: number;
  drawCount: number;
}

export class GameDailyReportQueryRepository extends GameCoreBaseRepo<BaseEntity> {
  constructor() {
    super({
      collName: GAME_DAILY_REPORT_COLLECTION,
    });
  }

  /**
   * Dashboard summary cho 1 ngày (tất cả game).
   */
  async getDashboardByDate(financialDate: string): Promise<DashboardSummary[]> {
    const result = await this.aggregate([
      {
        $match: {
          reportType: "company_daily",
          financialDate,
        },
      },
      { $sort: { gameProduct: 1 } },
    ]);
    return result.map(mapDashboardSummary);
  }

  /**
   * Dashboard summary cho 1 range ngày, group theo game.
   */
  async getDashboardByDateRange(
    fromDate: string,
    toDate: string,
    gameProduct?: GameProduct,
  ): Promise<DashboardSummary[]> {
    const match: Record<string, unknown> = {
      reportType: "company_daily",
      financialDate: { $gte: fromDate, $lte: toDate },
    };
    if (gameProduct) match.gameProduct = gameProduct;

    const result = await this.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$gameProduct",
          totalStake: { $sum: "$totalStake" },
          totalPayout: { $sum: "$totalPayout" },
          ggr: { $sum: "$ggr" },
          totalCommission: { $sum: "$totalCommission" },
          companyTake: { $sum: "$companyTake" },
          jackpotContribution: { $sum: "$jackpotContribution" },
          entryCount: { $sum: "$entryCount" },
          drawCount: { $sum: "$drawCount" },
          tenantCount: { $max: "$tenantCount" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return result.map((r: any) => ({
      gameProduct: r._id,
      financialDate: `${fromDate} ~ ${toDate}`,
      totalStake: r.totalStake,
      totalPayout: r.totalPayout,
      ggr: r.ggr,
      totalCommission: r.totalCommission,
      companyTake: r.companyTake,
      jackpotContribution: r.jackpotContribution,
      entryCount: r.entryCount,
      drawCount: r.drawCount,
      tenantCount: r.tenantCount,
    }));
  }

  /**
   * Chi tiết per tenant cho 1 ngày + game.
   */
  async getTenantReportsByDate(
    financialDate: string,
    gameProduct: GameProduct,
  ): Promise<TenantDailySummary[]> {
    const result = await this.aggregate([
      {
        $match: {
          reportType: "game_daily",
          financialDate,
          gameProduct,
        },
      },
      { $sort: { tenantId: 1 } },
    ]);

    return result.map((r: any) => ({
      tenantId: r.tenantId,
      totalStake: r.totalStake,
      totalPayout: r.totalPayout,
      ggr: r.ggr,
      commission: r.commission,
      netRevenue: r.netRevenue,
      entryCount: r.entryCount,
      drawCount: r.drawCount,
    }));
  }
}

function mapDashboardSummary(r: any): DashboardSummary {
  return {
    gameProduct: r.gameProduct,
    financialDate: r.financialDate,
    totalStake: r.totalStake,
    totalPayout: r.totalPayout,
    ggr: r.ggr,
    totalCommission: r.totalCommission,
    companyTake: r.companyTake,
    jackpotContribution: r.jackpotContribution,
    entryCount: r.entryCount,
    drawCount: r.drawCount,
    tenantCount: r.tenantCount,
  };
}
