/**
 * System Outstanding Report Repository — Max 3D
 *
 * Kế thừa base SystemOutstandingReportRepository từ game-core.
 * Thêm perGameColl trỏ vào max3d_outstanding_draw_reports.
 */

import {
  SystemOutstandingReportRepository,
  type OutstandingPerGameAggregateResult,
} from "@megawin/game-core-application/repos";
import { MAX3D_OUTSTANDING_DRAW_REPORTS } from "@megawin/game-max3d/entities";
import { BaseRepo } from "./base-repo";

export class SystemOutstandingRepo extends SystemOutstandingReportRepository {
  private readonly perGameColl = new BaseRepo<any>({
    collName: MAX3D_OUTSTANDING_DRAW_REPORTS,
  });

  async aggregateFromPerGame(): Promise<OutstandingPerGameAggregateResult> {
    const result = await this.perGameColl.aggregate([
      {
        $group: {
          _id: null,
          activeDrawCount: { $sum: 1 },
          totalEntryCount: { $sum: "$entryCount" },
          totalPlayerCount: { $sum: "$playerCount" },
          totalTenantCount: { $sum: "$tenantCount" },
          totalOutstandingStake: { $sum: "$totalStake" },
          totalEstimatedCommission: { $sum: "$estimatedCommission" },
        },
      },
    ]);

    if (result.length === 0) {
      return {
        activeDrawCount: 0,
        totalEntryCount: 0,
        totalPlayerCount: 0,
        totalTenantCount: 0,
        totalOutstandingStake: 0,
        totalEstimatedCommission: 0,
      };
    }

    const r = result[0] as any;
    return {
      activeDrawCount: r.activeDrawCount,
      totalEntryCount: r.totalEntryCount,
      totalPlayerCount: r.totalPlayerCount,
      totalTenantCount: r.totalTenantCount,
      totalOutstandingStake: r.totalOutstandingStake,
      totalEstimatedCommission: r.totalEstimatedCommission,
    };
  }
}
