/**
 * Keno – Outstanding Report Repository
 *
 * Ghi per-game outstanding draw snapshot cho Keno.
 * Collection: keno_outstanding_draw_reports.
 *
 * IDEMPOTENT: upsert overwrite với snapshotAt = now — chạy lại reset TTL.
 * TTL: snapshotAt + 900s → MongoDB tự xoá khi draw settle/void.
 * Keno KHÔNG có lineCount — không aggregate lineCount.
 */

import type { OutstandingDrawReport } from "@megawin/game-keno/entities";
import { KENO_OUTSTANDING_DRAW_REPORTS } from "@megawin/game-keno/entities";
import { BaseRepo } from "./base-repo";

/** Summary aggregate outstanding cho toàn game — dùng cho SyncSystemOutstanding. */
export interface OutstandingGameSummary {
  activeDrawCount: number;
  totalEntryCount: number;
  totalPlayerCount: number;
  totalTenantCount: number;
  totalOutstandingStake: number;
  totalEstimatedCommission: number;
}

/**
 * Repository ghi outstanding report cho Keno.
 *
 * Scheduled job (mỗi 5 phút) gọi upsertDrawReport cho từng draw active.
 * Sau khi draw settle/void, job ngừng tạo doc mới → TTL tự xoá.
 */
export class OutstandingReportRepository extends BaseRepo<any> {
  constructor() {
    super({ collName: KENO_OUTSTANDING_DRAW_REPORTS });
  }

  /**
   * Upsert snapshot outstanding cho 1 draw. Filter: { drawId }.
   *
   * Luôn set snapshotAt = now để reset TTL timer.
   * Idempotent: retry ghi đè, không duplicate.
   */
  async upsertDrawReport(
    report: Omit<OutstandingDrawReport, "snapshotAt" | "createdAt" | "updatedAt">,
  ): Promise<void> {
    const now = new Date();
    await this.findOneAndUpdate(
      {
        drawId: report.drawId,
      },
      {
        $set: {
          ...report,
          snapshotAt: now,
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
   * Aggregate tổng hợp toàn bộ outstanding draw reports hiện tại.
   *
   * Dùng bởi SyncSystemOutstanding để upsert vào system_outstanding_game_daily.
   */
  async aggregateForGame(): Promise<OutstandingGameSummary> {
    const result = await this.aggregate([
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
