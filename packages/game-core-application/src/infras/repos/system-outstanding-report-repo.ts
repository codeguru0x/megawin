/**
 * System Outstanding Report Repository (Base)
 *
 * Ghi và query system-level outstanding snapshot trong MongoDB.
 * Dùng chung cho tất cả game.
 *
 * Collection: system_outstanding_game_daily
 *
 * Chỉ làm việc với SYSTEM collection:
 *   - upsertGameOutstanding — ghi per-game outstanding aggregate vào system
 *   - findAll               — query tất cả outstanding hiện tại
 *
 * Per-game aggregate (từ per-game outstanding draw reports → system) nằm ở mỗi game package.
 * Game package thừa kế class này, thêm perGameColl + aggregateAndPublish().
 *
 * IDEMPOTENT: upsert overwrite — chạy lại an toàn.
 * TTL: snapshotAt + 300s → MongoDB tự xoá doc cũ.
 */

import { ReportRepo } from "@megawin/data/mongo";
import type { SystemOutstandingGameDaily, SystemOutstandingGameDailyEntity } from "@megawin/game-core/entities";
import { SYSTEM_OUTSTANDING_GAME_DAILY } from "@megawin/game-core/entities";

import { SystemOutstandingGameDailyMapper } from "../mappers";

/**
 * Base repository ghi và query system outstanding report.
 *
 * Chỉ làm việc với system_outstanding_game_daily collection.
 * Per-game aggregate logic nằm ở subclass trong mỗi game package.
 */
export class SystemOutstandingReportRepository extends ReportRepo<
  SystemOutstandingGameDailyEntity,
  SystemOutstandingGameDailyMapper
> {
  constructor() {
    super({
      collName: SYSTEM_OUTSTANDING_GAME_DAILY,
      dataMapper: new SystemOutstandingGameDailyMapper(),
    });
  }

  /**
   * Upsert snapshot outstanding cho 1 game.
   *
   * Refresh snapshotAt = now để reset TTL timer.
   * Filter: { gameProduct }.
   * IDEMPOTENT: chạy lại an toàn.
   */
  async upsertGameOutstanding(report: Omit<SystemOutstandingGameDaily, "updatedAt">): Promise<void> {
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
   * Query tất cả outstanding hiện tại (TTL active). Dùng outstanding page.
   *
   * Trả về tất cả docs trong system_outstanding_game_daily (chưa TTL expire).
   * Sort theo gameProduct ascending.
   */
  async findAllSorted(): Promise<SystemOutstandingGameDailyEntity[]> {
    return this.findMany(
      {},
      {
        sort: { gameProduct: 1 },
      },
    );
  }
}
