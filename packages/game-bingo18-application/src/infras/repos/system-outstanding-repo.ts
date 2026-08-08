/**
 * System Outstanding Report Repository — Bingo 18
 *
 * Kế thừa base SystemOutstandingReportRepository từ game-core.
 * Thêm perGameColl trỏ vào bingo18_outstanding_draw_reports.
 *
 * aggregateFromPerGame():
 *   Query bingo18_outstanding_draw_reports → SUM tất cả active draws
 *   → 1 summary row → dùng cho upsertGameOutstanding().
 */

import {
  SystemOutstandingReportRepository,
  type OutstandingPerGameAggregateResult,
} from "@megawin/game-core-application/repos";
import { BINGO18_OUTSTANDING_DRAW_REPORTS } from "@megawin/game-bingo18/entities";
import { BaseRepo } from "./base-repo";

export class SystemOutstandingRepo extends SystemOutstandingReportRepository {
  /** Collection per-game outstanding draw reports — aggregate source. */
  private readonly perGameColl = new BaseRepo<any>({
    collName: BINGO18_OUTSTANDING_DRAW_REPORTS,
  });

  /**
   * Aggregate tổng hợp toàn bộ per-game outstanding draw reports.
   *
   * SUM tất cả draws → 1 summary row.
   * Trả về zeros nếu không có draw active nào.
   */
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
