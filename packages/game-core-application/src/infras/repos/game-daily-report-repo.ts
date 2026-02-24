/**
 * Game Core – Game Daily Report Repository (Write)
 *
 * Collection: gameDailyReports
 *
 * Ghi báo cáo chung hàng ngày cho tất cả game.
 * Gọi bởi use case publishGameReport sau khi mỗi game settle xong.
 *
 * 3 loại report trong cùng 1 collection:
 *   - game_draw:     per tenant × per game × per draw
 *   - game_daily:    per tenant × per game × per date (tổng hợp)
 *   - company_daily: per game × per date (toàn công ty)
 *
 * Tất cả method dùng upsert → idempotent khi chạy lại settle.
 */

import type { BaseEntity } from "@megawin/data/mongo/base-entity";
import type { GameProduct } from "@megawin/game-core/entities";
import { GAME_DAILY_REPORT_COLLECTION } from "@megawin/game-core/entities";
import { GameCoreBaseRepo } from "./game-core-base-repo";

export interface GameDrawReportInput {
  tenantId: string;
  gameProduct: GameProduct;
  drawId: string;
  financialDate: string;
  totalStake: number;
  totalPayout: number;
  totalWin: number;
  ggr: number;
  commission: number;
  commissionRate: number;
  netRevenue: number;
  entryCount: number;
}

export interface CompanyDailyReportInput {
  gameProduct: GameProduct;
  financialDate: string;
  totalStake: number;
  totalPayout: number;
  totalWin: number;
  ggr: number;
  totalCommission: number;
  netRevenue: number;
  entryCount: number;
  companyTake: number;
  jackpotContribution: number;
  drawCount: number;
  tenantCount: number;
  jackpotTracking?: {
    openingAmount: number;
    closingAmount: number;
    hasJackpotWinner: boolean;
    totalContribution: number;
  };
}

export class GameDailyReportRepository extends GameCoreBaseRepo<BaseEntity> {
  constructor() {
    super({
      collName: GAME_DAILY_REPORT_COLLECTION,
    });
  }

  async upsertGameDrawReport(data: GameDrawReportInput): Promise<void> {
    const now = new Date();
    const filter = {
      reportType: "game_draw",
      tenantId: data.tenantId,
      gameProduct: data.gameProduct,
      drawId: data.drawId,
    };
    await this.updateOne(
      filter,
      {
        $set: {
          ...data,
          reportType: "game_draw",
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
  }

  /**
   * Aggregate từ tất cả game_draw reports cùng tenant + game + date
   * rồi upsert thành 1 document game_daily.
   */
  async upsertGameDailyReport(
    tenantId: string,
    gameProduct: GameProduct,
    financialDate: string,
  ): Promise<void> {
    const now = new Date();

    const result = await this.aggregate([
      {
        $match: {
          reportType: "game_draw",
          tenantId,
          gameProduct,
          financialDate,
        },
      },
      {
        $group: {
          _id: null,
          totalStake: { $sum: "$totalStake" },
          totalPayout: { $sum: "$totalPayout" },
          totalWin: { $sum: "$totalWin" },
          ggr: { $sum: "$ggr" },
          commission: { $sum: "$commission" },
          netRevenue: { $sum: "$netRevenue" },
          entryCount: { $sum: "$entryCount" },
          drawCount: { $sum: 1 },
          drawIds: { $push: "$drawId" },
          commissionRate: { $first: "$commissionRate" },
        },
      },
    ]);
    const agg = result[0] as any;

    if (!agg) return;

    await this.updateOne(
      {
        reportType: "game_daily",
        tenantId,
        gameProduct,
        financialDate,
      },
      {
        $set: {
          reportType: "game_daily",
          tenantId,
          gameProduct,
          financialDate,
          totalStake: agg.totalStake,
          totalPayout: agg.totalPayout,
          totalWin: agg.totalWin,
          ggr: agg.ggr,
          commission: agg.commission,
          commissionRate: agg.commissionRate,
          netRevenue: agg.netRevenue,
          entryCount: agg.entryCount,
          drawCount: agg.drawCount,
          drawIds: agg.drawIds,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
  }

  async upsertCompanyDailyReport(data: CompanyDailyReportInput): Promise<void> {
    const now = new Date();
    await this.updateOne(
      {
        reportType: "company_daily",
        gameProduct: data.gameProduct,
        financialDate: data.financialDate,
      },
      {
        $set: {
          ...data,
          reportType: "company_daily",
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
  }
}
