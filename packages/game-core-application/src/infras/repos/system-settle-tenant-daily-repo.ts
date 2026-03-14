/**
 * System Settle Tenant Daily Repository
 *
 * Ghi và aggregate system-level tenant daily settle reports vào MongoDB.
 * 1 doc = 1 tenant × 1 game × 1 financialDate (aggregate từ per-game tenant reports).
 *
 * Constructor nhận tên collection per-game để tạo perGameColl 1 lần duy nhất.
 *
 * Methods:
 *   upsertTenantDaily             — upsert vào system_settle_tenant_daily
 *   aggregateTenantsFromPerGame   — aggregate per-game tenant reports
 *
 * IDEMPOTENT: write dùng upsert overwrite — chạy lại an toàn.
 * KHÔNG dùng $inc — mọi field đều $set overwrite.
 */

import type { SystemSettleTenantDaily } from "@megawin/game-core/entities";
import { SYSTEM_SETTLE_TENANT_DAILY } from "@megawin/game-core/entities";
import { GameCoreBaseRepo } from "./game-core-base-repo";

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
 * Repository ghi và aggregate system tenant daily settle reports.
 *
 * Nhận `settleTenantReportCollection` (VD: lotto535_settle_tenant_reports) để
 * tạo perGameColl 1 lần trong constructor — không tạo lại mỗi lần aggregate.
 * Được gọi bởi PublishSettleDaily use case sau mỗi settle hoặc void.
 * Tất cả write dùng upsert pattern — idempotent, crash-safe.
 */
export class SystemSettleTenantDailyRepository extends GameCoreBaseRepo<any> {
  /** Per-game tenant report collection — dùng để aggregate, tạo 1 lần trong constructor. */
  private readonly perGameColl: GameCoreBaseRepo<any>;

  constructor(settleTenantReportCollection: string) {
    super({ collName: SYSTEM_SETTLE_TENANT_DAILY });
    this.perGameColl = new GameCoreBaseRepo({ collName: settleTenantReportCollection });
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
   * Aggregate per-game settle tenant reports → group by tenantId cho 1 ngày.
   *
   * Dùng perGameColl đã khởi tạo trong constructor (VD: lotto535_settle_tenant_reports).
   * Group by tenantId → SUM tất cả draws trong financialDate.
   * Trả về mảng per-tenant summaries.
   */
  async aggregateTenantsFromPerGame(
    financialDate: string,
  ): Promise<SettleTenantDailyAggregateResult[]> {
    const result = await this.perGameColl.aggregate([
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
