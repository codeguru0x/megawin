/**
 * System Settle Game Daily Repository (Base)
 *
 * Ghi và query system-level game daily settle reports trong MongoDB.
 * 1 doc = 1 game × 1 financialDate.
 *
 * Collection: system_settle_game_daily
 *
 * Chỉ làm việc với SYSTEM collection:
 *   - upsertGameDaily            — ghi per-game aggregate vào system
 *   - aggregateByFinancialDate   — query tổng hợp theo ngày
 *   - aggregateByGameProduct     — query tổng hợp theo game
 *   - findByFinancialDate        — raw docs cho 1 ngày
 *
 * Per-game aggregate (từ per-game draw reports → system) nằm ở mỗi game package.
 * Game package thừa kế class này, thêm perGameColl + aggregateAndPublish().
 *
 * IDEMPOTENT: write dùng upsert overwrite — chạy lại an toàn.
 */

import type {
  SystemSettleGameDaily,
  SystemSettleGameDailyEntity,
} from "@megawin/game-core/entities";
import { SYSTEM_SETTLE_GAME_DAILY } from "@megawin/game-core/entities";
import { ReportRepo } from "@megawin/data/mongo";
import { SystemSettleGameDailyMapper } from "../mappers";
import type { DailyOverviewRow, DashboardGameDailyData, GameSummaryRow } from "./types";

/**
 * Base repository ghi và query system game daily settle reports.
 *
 * Chỉ làm việc với system_settle_game_daily collection.
 * Per-game aggregate logic nằm ở subclass trong mỗi game package.
 */
export class SystemSettleGameDailyRepository extends ReportRepo<
  SystemSettleGameDailyEntity,
  SystemSettleGameDailyMapper
> {
  constructor() {
    super({
      collName: SYSTEM_SETTLE_GAME_DAILY,
      dataMapper: new SystemSettleGameDailyMapper(),
    });
  }

  /**
   * Upsert tổng hợp settle của 1 game trong 1 ngày tài chính.
   *
   * Re-aggregate từ per-game draw-level reports → overwrite toàn bộ.
   * Filter: { financialDate, gameProduct }.
   * IDEMPOTENT: chạy lại an toàn.
   */
  async upsertGameDaily(
    report: Omit<SystemSettleGameDaily, "createdAt" | "updatedAt">,
  ): Promise<void> {
    const now = new Date();
    await this.findOneAndUpdate(
      {
        financialDate: report.financialDate,
        gameProduct: report.gameProduct,
      },
      {
        $set: {
          ...report,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      {
        upsert: true,
      },
    );
  }

  /**
   * Aggregate by financialDate — SUM tất cả game cho mỗi ngày trong date range.
   *
   * Query vào system_settle_game_daily, group by financialDate.
   * Sort theo financialDate descending.
   * Dùng cho tab "Tổng quan ngày" trong System Financial Reports.
   * Index: { financialDate: 1 }
   */
  async aggregateByFinancialDate(from: string, to: string): Promise<DailyOverviewRow[]> {
    const result = await this.aggregate([
      // Lọc docs trong date range
      {
        $match: {
          financialDate: {
            $gte: from,
            $lte: to,
          },
        },
      },
      // Nhóm theo ngày tài chính → SUM tất cả game
      {
        $group: {
          _id: "$financialDate",
          drawCount: { $sum: "$drawCount" },
          entryCount: { $sum: "$entryCount" },
          playerCount: { $sum: "$playerCount" },
          tenantCount: { $max: "$tenantCount" },
          totalStake: { $sum: "$totalStake" },
          totalWin: { $sum: "$totalWin" },
          totalPayout: { $sum: "$totalPayout" },
          ggr: { $sum: "$ggr" },
          totalCommission: { $sum: "$totalCommission" },
          netProfit: { $sum: "$netProfit" },
        },
      },
      // Sắp xếp mới nhất trước
      {
        $sort: {
          _id: -1,
        },
      },
    ]);

    return result.map((r) => ({
      financialDate: r["_id"] as string,
      drawCount: r["drawCount"] as number,
      entryCount: r["entryCount"] as number,
      playerCount: r["playerCount"] as number,
      tenantCount: r["tenantCount"] as number,
      totalStake: r["totalStake"] as number,
      totalWin: r["totalWin"] as number,
      totalPayout: r["totalPayout"] as number,
      ggr: r["ggr"] as number,
      totalCommission: r["totalCommission"] as number,
      netProfit: r["netProfit"] as number,
    }));
  }

  /**
   * Aggregate by gameProduct — SUM tất cả ngày cho mỗi game trong date range.
   *
   * Query vào system_settle_game_daily, group by gameProduct.
   * Dùng cho tab "Theo game" trong System Financial Reports.
   * Index: { financialDate: 1, gameProduct: 1 }
   */
  async aggregateByGameProduct(from: string, to: string): Promise<GameSummaryRow[]> {
    const result = await this.aggregate([
      // Lọc docs trong date range
      {
        $match: {
          financialDate: {
            $gte: from,
            $lte: to,
          },
        },
      },
      // Nhóm theo game product → SUM tất cả ngày
      {
        $group: {
          _id: "$gameProduct",
          drawCount: { $sum: "$drawCount" },
          entryCount: { $sum: "$entryCount" },
          playerCount: { $sum: "$playerCount" },
          tenantCount: { $max: "$tenantCount" },
          totalStake: { $sum: "$totalStake" },
          totalWin: { $sum: "$totalWin" },
          totalPayout: { $sum: "$totalPayout" },
          ggr: { $sum: "$ggr" },
          totalCommission: { $sum: "$totalCommission" },
          netProfit: { $sum: "$netProfit" },
        },
      },
      // Sắp xếp theo doanh thu giảm dần
      {
        $sort: {
          totalStake: -1,
        },
      },
    ]);

    return result.map((r) => ({
      gameProduct: r["_id"] as string,
      drawCount: r["drawCount"] as number,
      entryCount: r["entryCount"] as number,
      playerCount: r["playerCount"] as number,
      tenantCount: r["tenantCount"] as number,
      totalStake: r["totalStake"] as number,
      totalWin: r["totalWin"] as number,
      totalPayout: r["totalPayout"] as number,
      ggr: r["ggr"] as number,
      totalCommission: r["totalCommission"] as number,
      netProfit: r["netProfit"] as number,
    }));
  }

  /**
   * Raw query cho 1 ngày — dùng cho inline expand game breakdown.
   *
   * Query system_settle_game_daily WHERE financialDate = ngày chỉ định.
   * Trả về tất cả docs của ngày đó (1 doc/game).
   * Index: { financialDate: 1 }
   */
  async findByFinancialDate(financialDate: string): Promise<SystemSettleGameDailyEntity[]> {
    return this.findMany({
      financialDate,
    });
  }

  /**
   * Raw query cho nhiều ngày tài chính cụ thể — dùng cho dashboard KPIs.
   *
   * Query system_settle_game_daily WHERE financialDate IN [...dates].
   * Trả về raw docs, client tách theo financialDate để compute KPI totals, trend %.
   * 1 query phục vụ zone KPI + Game Table + Game Mix + Payout Ratio + Trend %.
   * Index: { financialDate: 1, gameProduct: 1 }
   */
  async findByFinancialDates(financialDates: string[]): Promise<DashboardGameDailyData[]> {
    const result = await this.findMany({
      financialDate: { $in: financialDates } as unknown as string,
    });
    return result.map((r) => ({
      gameProduct: r.gameProduct as string,
      financialDate: r.financialDate as string,
      drawCount: r.drawCount as number,
      entryCount: r.entryCount as number,
      playerCount: r.playerCount as number,
      totalStake: r.totalStake as number,
      totalWin: r.totalWin as number,
      totalPayout: r.totalPayout as number,
      ggr: r.ggr as number,
      totalCommission: r.totalCommission as number,
      netProfit: r.netProfit as number,
    }));
  }
}
