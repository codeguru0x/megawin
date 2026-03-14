/**
 * System Settle Tenant Daily Repository — Max 3D
 *
 * Kế thừa base SystemSettleTenantDailyRepository từ game-core.
 * Thêm perGameColl trỏ vào max3d_settle_tenant_reports.
 */

import {
  SystemSettleTenantDailyRepository,
  type SettleTenantDailyAggregateResult,
} from "@megawin/game-core-application/repos";
import { MAX3D_SETTLE_TENANT_REPORTS } from "@megawin/game-max3d/entities";
import { BaseRepo } from "./base-repo";

export class SystemSettleTenantDailyRepo extends SystemSettleTenantDailyRepository {
  private readonly perGameColl = new BaseRepo<any>({
    collName: MAX3D_SETTLE_TENANT_REPORTS,
  });

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
