/**
 * System Settle Tenant Daily Repository (Base)
 *
 * Ghi và query system-level tenant daily settle reports trong MongoDB.
 * 1 doc = 1 tenant × 1 game × 1 financialDate.
 *
 * Collection: system_settle_tenant_daily
 *
 * Chỉ làm việc với SYSTEM collection:
 *   - upsertTenantDaily          — ghi per-game tenant aggregate vào system
 *   - aggregateByTenantId        — query tổng hợp theo tenant
 *   - findTenantGameBreakdown    — query game breakdown cho 1 tenant
 *
 * Per-game aggregate (từ per-game tenant reports → system) nằm ở mỗi game package.
 * Game package thừa kế class này, thêm perGameColl + aggregateAndPublish().
 *
 * IDEMPOTENT: write dùng upsert overwrite — chạy lại an toàn.
 */

import type {
  SystemSettleTenantDaily,
  SystemSettleTenantDailyEntity,
} from "@megawin/game-core/entities";
import { SYSTEM_SETTLE_TENANT_DAILY } from "@megawin/game-core/entities";
import type { GameProduct } from "@megawin/game-core/entities";
import { SystemSettleTenantDailyMapper } from "../mappers";
import { GameCoreBaseRepo } from "./game-core-base-repo";
import type { TenantSummaryRow } from "./types";

/**
 * Base repository ghi và query system tenant daily settle reports.
 *
 * Chỉ làm việc với system_settle_tenant_daily collection.
 * Per-game aggregate logic nằm ở subclass trong mỗi game package.
 */
export class SystemSettleTenantDailyRepository extends GameCoreBaseRepo<
  SystemSettleTenantDailyEntity,
  SystemSettleTenantDailyMapper
> {
  constructor() {
    super({
      collName: SYSTEM_SETTLE_TENANT_DAILY,
      dataMapper: new SystemSettleTenantDailyMapper(),
    });
  }

  /**
   * Upsert tổng hợp settle của 1 tenant × 1 game trong 1 ngày tài chính.
   *
   * Flatten design: 1 doc = 1 financialDate × 1 tenantId × 1 gameProduct.
   * Filter: { financialDate, tenantId, gameProduct }.
   * IDEMPOTENT: chạy lại an toàn.
   */
  async upsertTenantDaily(
    report: Omit<SystemSettleTenantDaily, "createdAt" | "updatedAt">,
  ): Promise<void> {
    const now = new Date();
    await this.findOneAndUpdate(
      {
        financialDate: report.financialDate,
        tenantId: report.tenantId,
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
   * Bulk upsert nhiều tenant daily reports trong 1 DB call.
   *
   * Dùng bulkWrite với N updateOne+upsert thay vì N lần findOneAndUpdate tuần tự.
   * Giảm latency từ N×RTT xuống 1 RTT bất kể số lượng tenant.
   * IDEMPOTENT: chạy lại an toàn — mỗi operation vẫn là upsert overwrite.
   * Noop-safe: nếu reports rỗng thì không gọi DB.
   */
  async bulkUpsertTenantDaily(
    reports: Omit<SystemSettleTenantDaily, "createdAt" | "updatedAt">[],
  ): Promise<void> {
    if (reports.length === 0) return;

    const now = new Date();
    await this.bulkWrite(
      reports.map((report) => ({
        updateOne: {
          filter: {
            financialDate: report.financialDate,
            tenantId: report.tenantId,
            gameProduct: report.gameProduct,
          },
          update: {
            $set: {
              ...report,
              updatedAt: now,
            },
            $setOnInsert: {
              createdAt: now,
            },
          },
          upsert: true,
        },
      })),
    );
  }

  /**
   * Aggregate by tenantId — SUM cross-game cho mỗi tenant trong date range.
   *
   * Query vào system_settle_tenant_daily, group by tenantId.
   * Optional filter theo gameProduct để chỉ lấy data của 1 game.
   * Sort theo totalStake descending. Dùng tab "Theo đại lý".
   * Index: { financialDate: 1, tenantId: 1, gameProduct: 1 }
   */
  async aggregateByTenantId(
    from: string,
    to: string,
    gameProduct?: GameProduct,
  ): Promise<TenantSummaryRow[]> {
    const matchStage: Record<string, unknown> = {
      financialDate: {
        $gte: from,
        $lte: to,
      },
    };

    // Filter theo game nếu được chỉ định
    if (gameProduct) {
      matchStage["gameProduct"] = gameProduct;
    }

    const result = await this.aggregate([
      // Lọc theo date range (và game nếu có)
      {
        $match: matchStage,
      },
      // Nhóm theo tenantId → SUM cross-game
      {
        $group: {
          _id: "$tenantId",
          gameCount: { $addToSet: "$gameProduct" },
          drawCount: { $sum: "$drawCount" },
          entryCount: { $sum: "$entryCount" },
          playerCount: { $sum: "$playerCount" },
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
      tenantId: r["_id"] as string,
      gameCount: (r["gameCount"] as string[]).length,
      drawCount: r["drawCount"] as number,
      entryCount: r["entryCount"] as number,
      playerCount: r["playerCount"] as number,
      totalStake: r["totalStake"] as number,
      totalWin: r["totalWin"] as number,
      totalPayout: r["totalPayout"] as number,
      ggr: r["ggr"] as number,
      totalCommission: r["totalCommission"] as number,
      netProfit: r["netProfit"] as number,
    }));
  }

  /**
   * Game breakdown cho 1 tenant trong date range — dùng inline expand.
   *
   * Query system_settle_tenant_daily WHERE tenantId + financialDate in range.
   * Sort theo gameProduct ascending.
   * Index: { financialDate: 1, tenantId: 1 }
   */
  async findTenantGameBreakdown(
    tenantId: string,
    from: string,
    to: string,
  ): Promise<SystemSettleTenantDailyEntity[]> {
    return this.findMany(
      {
        tenantId,
        financialDate: {
          $gte: from,
          $lte: to,
        },
      },
      {
        sort: { gameProduct: 1 },
      },
    );
  }
}
