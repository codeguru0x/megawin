/**
 * Use Case: Sync System Outstanding (Game Core – SHARED)
 *
 * Nhận per-game system outstanding repo (đã kế thừa base) để:
 *   1. Aggregate per-game outstanding draw reports
 *   2. Upsert system_outstanding_game_daily
 *
 * Được gọi bởi per-game sync-outstanding Lambda sau khi per-game sync xong.
 *
 * CRASH-SAFE: upsert overwrite — retry an toàn.
 * TTL: snapshotAt reset mỗi lần sync → doc tự expire nếu job không chạy 15 phút.
 */

import type { GameProduct } from "@megawin/game-core/entities";
import type {
  OutstandingPerGameAggregateResult,
  SystemOutstandingReportRepository,
} from "../infras/repos";
import { InternalUseCase } from "@megawin/app-core/use-cases";

/** Interface per-game repo phải implement để aggregate per-game outstanding reports. */
export interface SystemOutstandingPublisher extends SystemOutstandingReportRepository {
  aggregateFromPerGame(): Promise<OutstandingPerGameAggregateResult>;
}

export interface SyncSystemOutstandingInput {
  /** Game product để gắn vào system report. */
  gameProduct: GameProduct;
  /** Per-game system outstanding repo (kế thừa base, có aggregateFromPerGame). */
  gameOutstandingRepo: SystemOutstandingPublisher;
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
export class SyncSystemOutstandingUseCase extends InternalUseCase<
  SyncSystemOutstandingInput,
  SyncSystemOutstandingResult
> {
  /**
   * Aggregate toàn bộ outstanding draw reports của 1 game → upsert system snapshot.
   *
   * Nếu không có draw active → upsert với tất cả zeros (TTL vẫn reset).
   */
  protected async execute(input: SyncSystemOutstandingInput): Promise<SyncSystemOutstandingResult> {
    const { gameProduct, gameOutstandingRepo } = input;

    // Aggregate từ per-game collection — logic nằm trong per-game repo subclass
    const agg = await gameOutstandingRepo.aggregateFromPerGame();

    await gameOutstandingRepo.upsertGameOutstanding({
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
