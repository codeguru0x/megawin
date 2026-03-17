/**
 * Use Case: Publish Settle Daily (Game Core – SHARED)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * DÙNG CHUNG CHO TẤT CẢ GAME — gọi sau BuildSettleReport (settle) hoặc
 * BuildVoidReport (void-after-settle).
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Nhận per-game system repos (đã kế thừa base) để:
 *   1. Aggregate per-game draw reports → UPSERT system_settle_game_daily
 *   2. Aggregate per-game tenant reports → UPSERT system_settle_tenant_daily
 *
 * Mỗi game tạo SystemSettleGameDailyRepo + SystemSettleTenantDailyRepo
 * kế thừa base repos từ core, truyền vào đây.
 *
 * CRASH-SAFE:
 *   - Crash sau game_daily upsert: tenant_daily stale. Retry re-aggregate cả 2.
 *   - Crash giữa tenant upserts: partial update. Retry re-aggregate → idempotent.
 */

import type { GameProduct } from "@megawin/game-core/entities";
import type {
  SettleGameDailyAggregateResult,
  SystemSettleGameDailyRepository,
} from "../infras/repos";
import type {
  SettleTenantDailyAggregateResult,
  SystemSettleTenantDailyRepository,
} from "../infras/repos";
import { InternalUseCase } from "@megawin/app-core/use-cases";

/** Interface per-game repo phải implement để aggregate per-game draw reports. */
export interface SystemGameDailyPublisher extends SystemSettleGameDailyRepository {
  aggregateDrawsFromPerGame(financialDate: string): Promise<SettleGameDailyAggregateResult>;
}

/** Interface per-game repo phải implement để aggregate per-game tenant reports. */
export interface SystemTenantDailyPublisher extends SystemSettleTenantDailyRepository {
  aggregateTenantsFromPerGame(financialDate: string): Promise<SettleTenantDailyAggregateResult[]>;
}

export interface PublishSettleDailyInput {
  /** Game product để gắn vào system reports. */
  gameProduct: GameProduct;
  /** Ngày tài chính (YYYY-MM-DD). */
  financialDate: string;
  /** Per-game system game daily repo (kế thừa base, có aggregateDrawsFromPerGame). */
  gameDailyRepo: SystemGameDailyPublisher;
  /** Per-game system tenant daily repo (kế thừa base, có aggregateTenantsFromPerGame). */
  tenantDailyRepo: SystemTenantDailyPublisher;
}

export interface PublishSettleDailyResult {
  /** Game product đã publish. */
  gameProduct: GameProduct;
  /** Ngày tài chính đã publish. */
  financialDate: string;
  /** Số draw đã aggregate vào game daily. */
  drawCount: number;
  /** Số tenant đã upsert vào tenant daily. */
  tenantCount: number;
}

/**
 * Re-aggregate per-game draw-level reports → upsert system daily reports.
 *
 * IDEMPOTENT: chạy lại nhiều lần cho cùng kết quả.
 * KHÔNG dùng $inc — luôn overwrite toàn bộ.
 */
export class PublishSettleDailyUseCase extends InternalUseCase<
  PublishSettleDailyInput,
  PublishSettleDailyResult
> {
  /**
   * Re-aggregate và publish daily reports lên system level.
   *
   * Nhận per-game system repos đã kế thừa base từ core.
   * Game void-after-settle: draw-level đã xoá → aggregate giảm → system giảm.
   */
  async execute(input: PublishSettleDailyInput): Promise<PublishSettleDailyResult> {
    const { gameProduct, financialDate, gameDailyRepo, tenantDailyRepo } = input;

    // ── Bước 1: Aggregate draw-level → upsert system_settle_game_daily ────────
    const drawAgg = await gameDailyRepo.aggregateDrawsFromPerGame(financialDate);

    await gameDailyRepo.upsertGameDaily({
      gameProduct,
      financialDate,
      drawCount: drawAgg.drawCount,
      entryCount: drawAgg.entryCount,
      playerCount: drawAgg.playerCount,
      tenantCount: drawAgg.tenantCount,
      totalStake: drawAgg.totalStake,
      totalWin: drawAgg.totalWin,
      totalPayout: drawAgg.totalPayout,
      ggr: drawAgg.ggr,
      totalCommission: drawAgg.totalCommission,
      netProfit: drawAgg.netProfit,
    });

    // ── Bước 2: Aggregate tenant-level → upsert system_settle_tenant_daily ───
    const tenantAggs = await tenantDailyRepo.aggregateTenantsFromPerGame(financialDate);

    // Bulk upsert tất cả tenants trong 1 DB call — giảm từ N×RTT xuống 1 RTT.
    await tenantDailyRepo.bulkUpsertTenantDaily(
      tenantAggs.map((r) => ({
        financialDate,
        tenantId: r.tenantId,
        gameProduct,
        totalStake: r.totalStake,
        totalWin: r.totalWin,
        totalPayout: r.totalPayout,
        ggr: r.ggr,
        totalCommission: r.totalCommission,
        netProfit: r.netProfit,
        entryCount: r.entryCount,
        playerCount: r.playerCount,
        drawCount: r.drawCount,
      })),
    );

    return {
      gameProduct,
      financialDate,
      drawCount: drawAgg.drawCount,
      tenantCount: tenantAggs.length,
    };
  }
}
