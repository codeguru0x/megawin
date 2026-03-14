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
 * Base repository ghi và query system outstanding report.
 *
 * Chỉ làm việc với system_outstanding_game_daily collection.
 * Per-game aggregate logic nằm ở subclass trong mỗi game package.
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
   * Query tất cả outstanding hiện tại (TTL active). Dùng outstanding page.
   *
   * Trả về tất cả docs trong system_outstanding_game_daily (chưa TTL expire).
   * Sort theo gameProduct ascending.
   */
  async findAll(): Promise<SystemOutstandingGameDaily[]> {
    return (await this.findMany({}, { sort: { gameProduct: 1 } })) as SystemOutstandingGameDaily[];
  }
}
