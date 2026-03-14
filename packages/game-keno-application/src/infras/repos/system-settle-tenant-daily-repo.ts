/**
 * System Settle Tenant Daily Repository — Keno
 *
 * Kế thừa base SystemSettleTenantDailyRepository từ game-core.
 * Thêm perGameColl trỏ vào keno_settle_tenant_reports.
 *
 * aggregateTenantsFromPerGame():
 *   Query keno_settle_tenant_reports WHERE { financialDate }
 *   → group by tenantId → per-tenant summaries → dùng cho upsertTenantDaily().
 */

import {
  SystemSettleTenantDailyRepository,
  type SettleTenantDailyAggregateResult,
} from "@megawin/game-core-application/repos";
import { KENO_SETTLE_TENANT_REPORTS } from "@megawin/game-keno/entities";
import { BaseRepo } from "./base-repo";

export class SystemSettleTenantDailyRepo extends SystemSettleTenantDailyRepository {
  /** Collection per-game tenant reports — aggregate source. */
  private readonly perGameColl = new BaseRepo<any>({
    collName: KENO_SETTLE_TENANT_REPORTS,
  });

  /**
   * Aggregate per-game settle tenant reports → group by tenantId cho 1 ngày.
   *
   * Group by tenantId → SUM tất cả draws trong financialDate.
   * Trả về mảng per-tenant summaries.
   */
  async aggregateTenantsFromPerGame(
    financialDate: string,
  ): Promise<SettleTenantDailyAggregateResult[]> {
    const result = await this.perGameColl.aggregate([
      { $match: { financialDate } },
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
