/**
 * Power 6/55 – Outstanding Report Repository
 *
 * Ghi per-game outstanding draw snapshot cho Power 6/55.
 * Collection: power655_outstanding_draw_reports.
 *
 * IDEMPOTENT: upsert overwrite với snapshotAt = now — chạy lại reset TTL.
 * TTL: snapshotAt + 300s → MongoDB tự xoá khi draw settle/void.
 */

import type { OutstandingDrawReport, OutstandingDrawReportEntity } from "@megawin/game-power655/entities";
import { POWER655_OUTSTANDING_DRAW_REPORTS } from "@megawin/game-power655/entities";
import { BaseRepo } from "./base-repo";
import { OutstandingDrawReportMapper } from "../mappers";
import type { OutstandingGameSummary } from "./types";

/**
 * Repository ghi outstanding report cho Power 6/55.
 *
 * Scheduled job (mỗi 5 phút) gọi bulkUpsertDrawReports để refresh tất cả draws active trong 1 DB call.
 * Sau khi draw settle/void, job ngừng tạo doc mới → TTL tự xoá.
 */
export class OutstandingReportRepository extends BaseRepo<OutstandingDrawReportEntity, OutstandingDrawReportMapper> {
  constructor() {
    super({
      collName: POWER655_OUTSTANDING_DRAW_REPORTS,
      dataMapper: new OutstandingDrawReportMapper(),
    });
  }

  /**
   * Upsert snapshot outstanding cho 1 draw. Filter: { drawId }.
   *
   * Luôn set snapshotAt = now để reset TTL timer.
   * Idempotent: retry ghi đè, không duplicate.
   */
  async upsertDrawReport(report: Omit<OutstandingDrawReport, "snapshotAt" | "createdAt" | "updatedAt">): Promise<void> {
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
   * Bulk upsert snapshot outstanding cho nhiều draws — 1 DB call duy nhất.
   *
   * Mỗi operation là updateOne { upsert: true } filter by { drawId }.
   * snapshotAt = now reset TTL cho tất cả draws cùng lúc.
   * Idempotent: chạy lại overwrite, không duplicate.
   * Index: { drawId: 1 } unique.
   */
  async bulkUpsertDrawReports(
    reports: Array<Omit<OutstandingDrawReport, "snapshotAt" | "createdAt" | "updatedAt">>,
  ): Promise<void> {
    if (reports.length === 0) {
      return;
    }

    const now = new Date();

    await this.bulkWrite(
      reports.map((report) => ({
        updateOne: {
          filter: {
            drawId: report.drawId,
          },
          update: {
            $set: {
              ...report,
              snapshotAt: now,
              updatedAt: now,
            },
            $setOnInsert: {
              createdAt: now,
            },
          },
          upsert: true,
        },
      })),
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

  /**
   * Tất cả outstanding draws hiện đang active.
   *
   * Dùng cho Outstanding Reports UI page. Sort theo drawId.
   */
  async findAll(): Promise<OutstandingDrawReportEntity[]> {
    return await this.findMany({}, { sort: { drawId: 1 } });
  }
}
