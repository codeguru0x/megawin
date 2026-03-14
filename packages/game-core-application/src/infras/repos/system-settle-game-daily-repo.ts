/**
 * System Settle Game Daily Repository
 *
 * Ghi và aggregate system-level game daily settle reports vào MongoDB.
 * 1 doc = 1 game × 1 financialDate (aggregate từ per-game draw reports).
 *
 * Constructor nhận tên collection per-game để tạo perGameColl 1 lần duy nhất.
 *
 * Methods:
 *   upsertGameDaily             — upsert vào system_settle_game_daily
 *   aggregateDrawsFromPerGame   — aggregate per-game draw reports
 *
 * IDEMPOTENT: write dùng upsert overwrite — chạy lại an toàn.
 * KHÔNG dùng $inc — mọi field đều $set overwrite.
 */

import type { SystemSettleGameDaily } from "@megawin/game-core/entities";
import { SYSTEM_SETTLE_GAME_DAILY } from "@megawin/game-core/entities";
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

/**
 * Repository ghi và aggregate system game daily settle reports.
 *
 * Nhận `settleDrawReportCollection` (VD: lotto535_settle_draw_reports) để
 * tạo perGameColl 1 lần trong constructor — không tạo lại mỗi lần aggregate.
 * Được gọi bởi PublishSettleDaily use case sau mỗi settle hoặc void.
 * Tất cả write dùng upsert pattern — idempotent, crash-safe.
 */
export class SystemSettleGameDailyRepository extends GameCoreBaseRepo<any> {
  /** Per-game draw report collection — dùng để aggregate, tạo 1 lần trong constructor. */
  private readonly perGameColl: GameCoreBaseRepo<any>;

  constructor(settleDrawReportCollection: string) {
    super({ collName: SYSTEM_SETTLE_GAME_DAILY });
    this.perGameColl = new GameCoreBaseRepo({ collName: settleDrawReportCollection });
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
   * Aggregate per-game settle draw reports → tổng hợp cho 1 game × 1 ngày.
   *
   * Dùng perGameColl đã khởi tạo trong constructor (VD: lotto535_settle_draw_reports).
   * SUM tất cả draws trong financialDate → 1 summary row.
   * Trả về zeros nếu không có draw nào settle trong ngày.
   */
  async aggregateDrawsFromPerGame(financialDate: string): Promise<SettleGameDailyAggregateResult> {
    const result = await this.perGameColl.aggregate([
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
}
