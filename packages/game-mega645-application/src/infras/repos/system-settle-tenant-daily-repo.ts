/**
 * System Settle Tenant Daily Repository — Mega 6/45
 *
 * Kế thừa base SystemSettleTenantDailyRepository từ game-core.
 * Thêm perGameColl trỏ vào mega645_settle_tenant_reports.
 *
 * aggregateTenantsFromPerGame():
 *   Query mega645_settle_tenant_reports WHERE { financialDate }
 *   → group by tenantId → per-tenant summaries → dùng cho upsertTenantDaily().
 */

import {
  SystemSettleTenantDailyRepository,
  type SettleTenantDailyAggregateResult,
} from "@megawin/game-core-application/repos";
import { MEGA645_SETTLE_TENANT_REPORTS } from "@megawin/game-mega645/entities";
import { BaseRepo } from "./base-repo";

export class SystemSettleTenantDailyRepo extends SystemSettleTenantDailyRepository {
  /** Collection per-game tenant reports — aggregate source. */
  private readonly perGameColl = new BaseRepo<any>({
    collName: MEGA645_SETTLE_TENANT_REPORTS,
  });

  /**
   * Aggregate per-game settle tenant reports → group by tenantId cho 1 ngày.
   *
   * Group by tenantId → SUM tất cả draws trong financialDate.
   * Trả về mảng per-tenant summaries.
   */
  async aggregateTenantsFromPerGame(financialDate: string): Promise<SettleTenantDailyAggregateResult[]> {
    const result = await this.perGameColl.aggregate([
      // Lọc tenant reports theo ngày tài chính
      { $match: { financialDate } },
      // Nhóm theo tenant → SUM tất cả draws trong ngày
      {
        $group: {
          _id: "$tenantId",
          totalStake: { $sum: "$totalStake" },
          totalWin: { $sum: "$totalWin" },
          totalPayout: { $sum: "$totalPayout" },
          ggr: { $sum: "$ggr" },
          totalCommission: { $sum: "$totalCommission" },
          netProfit: { $sum: "$netProfit" },
          entryCount: { $sum: "$entryCount" },
          playerCount: { $sum: "$playerCount" },
          drawCount: { $sum: 1 },
        },
      },
    ]);

    return (result as any[]).map((r) => ({
      tenantId: r._id,
      totalStake: r.totalStake,
      totalWin: r.totalWin,
      totalPayout: r.totalPayout,
      ggr: r.ggr,
      totalCommission: r.totalCommission,
      netProfit: r.netProfit,
      entryCount: r.entryCount,
      playerCount: r.playerCount,
      drawCount: r.drawCount,
    }));
  }
}
