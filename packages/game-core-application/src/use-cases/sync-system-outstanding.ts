/**
 * Use Case: Sync System Outstanding (Game Core – SHARED)
 *
 * Aggregate tất cả per-game outstanding_draw_reports → upsert system_outstanding_game_daily.
 * Dùng chung cho tất cả game — nhận collection name + gameProduct làm input.
 *
 * Được gọi bởi SyncSystemOutstanding Lambda sau khi per-game sync xong.
 *
 * CRASH-SAFE: upsert overwrite — retry an toàn.
 * TTL: snapshotAt reset mỗi lần sync → doc tự expire nếu job không chạy 15 phút.
 */

import type { GameProduct } from "@megawin/game-core/entities";
import { SystemOutstandingReportRepository } from "../infras/repos/system-outstanding-report-repo";

export interface SyncSystemOutstandingInput {
  /** Game product để gắn vào system report. */
  gameProduct: GameProduct;
  /** Tên collection per-game outstanding draw reports. */
  outstandingDrawReportCollection: string;
}

export interface SyncSystemOutstandingResult {
  gameProduct: GameProduct;
  activeDrawCount: number;
  totalEntryCount: number;
  totalOutstandingStake: number;
}

/**
 * Aggregate per-game outstanding draw reports → upsert system_outstanding_game_daily.
 *
 * IDEMPOTENT: upsert overwrite với snapshotAt = now — reset TTL timer.
 */
export class SyncSystemOutstandingUseCase {
  private readonly systemRepo = new SystemOutstandingReportRepository();

  /**
   * Aggregate toàn bộ outstanding draw reports của 1 game → upsert system snapshot.
   *
   * Nếu không có draw active → upsert với tất cả zeros (TTL vẫn reset).
   * Aggregation nằm trong repo — use case chỉ orchestrate flow.
   */
  async execute(input: SyncSystemOutstandingInput): Promise<SyncSystemOutstandingResult> {
    const { gameProduct, outstandingDrawReportCollection } = input;

    // Aggregate từ per-game collection — query nằm trong repo layer
    const agg = await this.systemRepo.aggregateFromPerGameCollection(
      outstandingDrawReportCollection,
    );

    await this.systemRepo.upsertGameOutstanding({
      gameProduct,
      activeDrawCount: agg.activeDrawCount,
      totalEntryCount: agg.totalEntryCount,
      totalPlayerCount: agg.totalPlayerCount,
      totalTenantCount: agg.totalTenantCount,
      totalOutstandingStake: agg.totalOutstandingStake,
      totalEstimatedCommission: agg.totalEstimatedCommission,
      snapshotAt: new Date(),
    });

    return {
      gameProduct,
      activeDrawCount: agg.activeDrawCount,
      totalEntryCount: agg.totalEntryCount,
      totalOutstandingStake: agg.totalOutstandingStake,
    };
  }
}
