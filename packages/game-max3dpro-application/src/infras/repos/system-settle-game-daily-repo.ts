/**
 * System Settle Game Daily Repository — Max 3D Pro
 *
 * Kế thừa base SystemSettleGameDailyRepository từ game-core.
 * Thêm perGameColl trỏ vào max3dpro_settle_draw_reports.
 *
 * aggregateDrawsFromPerGame():
 *   Query max3dpro_settle_draw_reports WHERE { financialDate }
 *   → SUM tất cả draws → 1 summary row → dùng cho upsertGameDaily().
 */

import {
  SystemSettleGameDailyRepository,
  type SettleGameDailyAggregateResult,
} from "@megawin/game-core-application/repos";
import { MAX3DPRO_SETTLE_DRAW_REPORTS } from "@megawin/game-max3dpro/entities";
import { BaseRepo } from "./base-repo";

export class SystemSettleGameDailyRepo extends SystemSettleGameDailyRepository {
  /** Collection per-game draw reports — aggregate source. */
  private readonly perGameColl = new BaseRepo<any>({
    collName: MAX3DPRO_SETTLE_DRAW_REPORTS,
  });

  async aggregateDrawsFromPerGame(financialDate: string): Promise<SettleGameDailyAggregateResult> {
    const result = await this.perGameColl.aggregate([
      { $match: { financialDate } },
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
        drawCount: 0, entryCount: 0, playerCount: 0, tenantCount: 0,
        totalStake: 0, totalPayout: 0, ggr: 0, totalCommission: 0, netProfit: 0,
      };
    }

    const r = result[0] as any;
    return {
      drawCount: r.drawCount, entryCount: r.entryCount, playerCount: r.playerCount,
      tenantCount: r.tenantCount, totalStake: r.totalStake, totalPayout: r.totalPayout,
      ggr: r.ggr, totalCommission: r.totalCommission, netProfit: r.netProfit,
    };
  }
}
