/**
 * System Settle Report Repository
 *
 * Ghi system-level settle reports (cross-game) vào MongoDB.
 * Dùng chung cho tất cả game — gọi sau khi build per-game reports.
 *
 * Methods:
 *   upsertGameDaily                         — update system_settle_game_daily
 *   upsertTenantDaily                       — update system_settle_tenant_daily
 *   aggregateDrawsFromPerGameCollection     — aggregate per-game draw reports
 *   aggregateTenantsFromPerGameCollection   — aggregate per-game tenant reports
 *
 * IDEMPOTENT: tất cả write đều upsert overwrite — chạy lại an toàn.
 * KHÔNG dùng $inc — mọi field đều $set overwrite.
 */

import type { SystemSettleGameDaily, SystemSettleTenantDaily } from "@megawin/game-core/entities";
import { SYSTEM_SETTLE_GAME_DAILY, SYSTEM_SETTLE_TENANT_DAILY } from "@megawin/game-core/entities";
import { GameCoreBaseRepo } from "./game-core-base-repo";

/** Kết quả aggregate từ per-game settle draw reports theo financialDate. */
export interface SettleGameDailyAggregateResult {
  drawCount: number;
  entryCount: number;
  playerCount: number;
  tenantCount: number;
  totalStake: number;
  totalPayout: number;
  ggr: number;
  totalCommission: number;
  netProfit: number;
}

/** Kết quả aggregate từ per-game settle tenant reports theo financialDate, group by tenantId. */
export interface SettleTenantDailyAggregateResult {
  tenantId: string;
  totalStake: number;
  totalPayout: number;
  ggr: number;
  commission: number;
  netProfit: number;
  entryCount: number;
  playerCount: number;
  drawCount: number;
}

/**
 * Repository ghi system-level settle reports.
 *
 * Được gọi bởi PublishSettleDaily use case sau mỗi settle hoặc void.
 * Tất cả write dùng upsert pattern — idempotent, crash-safe.
 */
export class SystemSettleReportRepository extends GameCoreBaseRepo<any> {
  private readonly gameDailyColl: GameCoreBaseRepo<any>;
  private readonly tenantDailyColl: GameCoreBaseRepo<any>;

  constructor() {
    super({ collName: SYSTEM_SETTLE_GAME_DAILY });
    this.gameDailyColl = this;
    this.tenantDailyColl = new GameCoreBaseRepo({ collName: SYSTEM_SETTLE_TENANT_DAILY });
  }

  /**
   * Upsert tổng hợp settle của 1 game trong 1 ngày tài chính.
   *
   * Re-aggregate từ per-game draw-level reports → overwrite toàn bộ.
   * Filter: { financialDate, gameProduct }.
   */
  async upsertGameDaily(
    report: Omit<SystemSettleGameDaily, "createdAt" | "updatedAt">,
  ): Promise<void> {
    const now = new Date();
    await this.gameDailyColl.findOneAndUpdate(
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
   * Upsert tổng hợp settle của 1 tenant × 1 game trong 1 ngày tài chính.
   *
   * Flatten design: 1 doc = 1 financialDate × 1 tenantId × 1 gameProduct.
   * Filter: { financialDate, tenantId, gameProduct }.
   */
  async upsertTenantDaily(
    report: Omit<SystemSettleTenantDaily, "createdAt" | "updatedAt">,
  ): Promise<void> {
    const now = new Date();
    await this.tenantDailyColl.findOneAndUpdate(
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
   * Aggregate per-game settle draw reports → tổng hợp cho 1 game × 1 ngày.
   *
   * Query vào collection per-game (VD: lotto535_settle_draw_reports) rồi
   * SUM tất cả draws trong financialDate → 1 summary row.
   * Trả về zeros nếu không có draw nào settle trong ngày.
   */
  async aggregateDrawsFromPerGameCollection(
    settleDrawReportCollection: string,
    financialDate: string,
  ): Promise<SettleGameDailyAggregateResult> {
    const drawColl = new GameCoreBaseRepo({ collName: settleDrawReportCollection });

    const result = await drawColl.aggregate([
      {
        $match: {
          financialDate,
        },
      },
      {
        $group: {
          _id: null,
          drawCount: { $sum: 1 },
          entryCount: { $sum: "$entryCount" },
          playerCount: { $sum: "$playerCount" },
          tenantCount: { $max: "$tenantCount" },
          totalStake: { $sum: "$totalStake" },
          totalPayout: { $sum: "$totalPayout" },
          ggr: { $sum: "$ggr" },
          totalCommission: { $sum: "$totalCommission" },
          netProfit: { $sum: "$netProfit" },
        },
      },
    ]);

    if (result.length === 0) {
      return {
        drawCount: 0,
        entryCount: 0,
        playerCount: 0,
        tenantCount: 0,
        totalStake: 0,
        totalPayout: 0,
        ggr: 0,
        totalCommission: 0,
        netProfit: 0,
      };
    }

    const r = result[0] as any;
    return {
      drawCount: r.drawCount,
      entryCount: r.entryCount,
      playerCount: r.playerCount,
      tenantCount: r.tenantCount,
      totalStake: r.totalStake,
      totalPayout: r.totalPayout,
      ggr: r.ggr,
      totalCommission: r.totalCommission,
      netProfit: r.netProfit,
    };
  }

  /**
   * Aggregate per-game settle tenant reports → group by tenantId cho 1 ngày.
   *
   * Query vào collection per-game (VD: lotto535_settle_tenant_reports) rồi
   * group by tenantId → SUM tất cả draws trong financialDate.
   * Trả về mảng per-tenant summaries.
   */
  async aggregateTenantsFromPerGameCollection(
    settleTenantReportCollection: string,
    financialDate: string,
  ): Promise<SettleTenantDailyAggregateResult[]> {
    const tenantColl = new GameCoreBaseRepo({ collName: settleTenantReportCollection });

    const result = await tenantColl.aggregate([
      {
        $match: {
          financialDate,
        },
      },
      {
        $group: {
          _id: "$tenantId",
          totalStake: { $sum: "$totalStake" },
          totalPayout: { $sum: "$totalPayout" },
          ggr: { $sum: "$ggr" },
          commission: { $sum: "$commission" },
          netProfit: { $sum: { $subtract: ["$ggr", "$commission"] } },
          entryCount: { $sum: "$entryCount" },
          playerCount: { $sum: "$playerCount" },
          drawCount: { $sum: 1 },
        },
      },
    ]);

    return (result as any[]).map((r) => ({
      tenantId: r._id,
      totalStake: r.totalStake,
      totalPayout: r.totalPayout,
      ggr: r.ggr,
      commission: r.commission,
      netProfit: r.netProfit,
      entryCount: r.entryCount,
      playerCount: r.playerCount,
      drawCount: r.drawCount,
    }));
  }
}
