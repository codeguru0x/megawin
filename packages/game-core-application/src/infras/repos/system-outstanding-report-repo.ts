/**
 * System Outstanding Report Repository
 *
 * Ghi system-level outstanding snapshot vào MongoDB.
 * Dùng chung cho tất cả game — gọi từ SyncSystemOutstanding scheduled job.
 *
 * Methods:
 *   upsertGameOutstanding           — upsert system_outstanding_game_daily
 *   aggregateFromPerGameCollection  — aggregate per-game outstanding draw reports
 *
 * IDEMPOTENT: upsert overwrite — chạy lại an toàn.
 * TTL: snapshotAt + 900s → MongoDB tự xoá doc cũ.
 */

import type { SystemOutstandingGameDaily } from "@megawin/game-core/entities";
import { SYSTEM_OUTSTANDING_GAME_DAILY } from "@megawin/game-core/entities";
import { GameCoreBaseRepo } from "./game-core-base-repo";

/** Kết quả aggregate từ per-game outstanding draw reports. */
export interface OutstandingPerGameAggregateResult {
  activeDrawCount: number;
  totalEntryCount: number;
  totalPlayerCount: number;
  totalTenantCount: number;
  totalOutstandingStake: number;
  totalEstimatedCommission: number;
}

/**
 * Repository ghi system-level outstanding report.
 *
 * Được gọi bởi SyncSystemOutstanding use case mỗi 5 phút.
 * TTL index tự xoá doc khi draw settle/void (job ngừng refresh).
 */
export class SystemOutstandingReportRepository extends GameCoreBaseRepo<any> {
  constructor() {
    super({ collName: SYSTEM_OUTSTANDING_GAME_DAILY });
  }

  /**
   * Upsert snapshot outstanding cho 1 game.
   *
   * Refresh snapshotAt = now để reset TTL timer.
   * Filter: { gameProduct }.
   */
  async upsertGameOutstanding(
    report: Omit<SystemOutstandingGameDaily, "updatedAt">,
  ): Promise<void> {
    const now = new Date();
    await this.findOneAndUpdate(
      {
        gameProduct: report.gameProduct,
      },
      {
        $set: {
          ...report,
          updatedAt: now,
        },
      },
      {
        upsert: true,
      },
    );
  }

  /**
   * Aggregate tổng hợp toàn bộ per-game outstanding draw reports.
   *
   * Query vào collection per-game (VD: lotto535_outstanding_draw_reports)
   * rồi SUM tất cả draws → 1 summary row.
   * Trả về zeros nếu không có draw active nào.
   */
  async aggregateFromPerGameCollection(
    outstandingDrawReportCollection: string,
  ): Promise<OutstandingPerGameAggregateResult> {
    const perGameColl = new GameCoreBaseRepo({ collName: outstandingDrawReportCollection });

    const result = await perGameColl.aggregate([
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
