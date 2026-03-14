/**
 * Use Case: Publish Settle Daily (Game Core – SHARED)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * DÙNG CHUNG CHO TẤT CẢ GAME — gọi sau BuildSettleReport (settle) hoặc
 * BuildVoidReport (void-after-settle).
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Re-aggregate per-game draw-level reports → UPSERT system reports.
 * Draw-level là source of truth — daily luôn re-aggregate từ draw-level.
 *
 * FLOW (2 bước):
 *   1. Aggregate ALL {prefix}_settle_draw_reports WHERE { financialDate }
 *      → UPSERT system_settle_game_daily { financialDate, gameProduct }
 *   2. Aggregate ALL {prefix}_settle_tenant_reports WHERE { financialDate }
 *      → group by tenantId
 *      → UPSERT system_settle_tenant_daily { financialDate, tenantId, gameProduct }
 *
 * CRASH-SAFE:
 *   - Crash sau game_daily upsert: tenant_daily stale. Retry re-aggregate cả 2.
 *   - Crash giữa tenant upserts: partial update. Retry re-aggregate → idempotent.
 *
 * LƯU Ý:
 *   - Nhận collection names làm input để reuse cho mọi game.
 *   - KHÔNG có step 3 — daily total = aggregate system_settle_game_daily on read.
 *   - Khi void-after-settle: settle reports đã bị xoá trước khi gọi use case này
 *     → aggregate trả về totals đã giảm → system daily tự giảm (correct).
 *   - Aggregation queries nằm trong repo layer — use case chỉ orchestrate.
 */

import type { GameProduct } from "@megawin/game-core/entities";
import { SystemSettleGameDailyRepository } from "../infras/repos/system-settle-game-daily-repo";
import { SystemSettleTenantDailyRepository } from "../infras/repos/system-settle-tenant-daily-repo";

export interface PublishSettleDailyInput {
  /** Game product để gắn vào system reports. */
  gameProduct: GameProduct;
  /** Ngày tài chính (YYYY-MM-DD). */
  financialDate: string;
  /** Tên collection per-game settle draw reports (VD: lotto535_settle_draw_reports). */
  settleDrawReportCollection: string;
  /** Tên collection per-game settle tenant reports (VD: lotto535_settle_tenant_reports). */
  settleTenantReportCollection: string;
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
export class PublishSettleDailyUseCase {
  /**
   * Re-aggregate và publish daily reports lên system level.
   *
   * Nhận collection names để reuse cross-game — không hardcode prefix.
   * Game void-after-settle: draw-level đã xoá → aggregate giảm → system giảm.
   * Repo được khởi tạo với collection name → perGameColl tạo 1 lần trong constructor.
   */
  async execute(input: PublishSettleDailyInput): Promise<PublishSettleDailyResult> {
    const { gameProduct, financialDate, settleDrawReportCollection, settleTenantReportCollection } =
      input;

    const gameDailyRepo = new SystemSettleGameDailyRepository(settleDrawReportCollection);
    const tenantDailyRepo = new SystemSettleTenantDailyRepository(settleTenantReportCollection);

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
      totalPayout: drawAgg.totalPayout,
      ggr: drawAgg.ggr,
      totalCommission: drawAgg.totalCommission,
      netProfit: drawAgg.netProfit,
    });

    // ── Bước 2: Aggregate tenant-level → upsert system_settle_tenant_daily ───
    const tenantAggs = await tenantDailyRepo.aggregateTenantsFromPerGame(financialDate);

    // Upsert từng tenant — số tenant nhỏ (thường < 100) nên loop acceptable
    for (const r of tenantAggs) {
      await tenantDailyRepo.upsertTenantDaily({
        financialDate,
        tenantId: r.tenantId,
        gameProduct,
        totalStake: r.totalStake,
        totalPayout: r.totalPayout,
        ggr: r.ggr,
        commission: r.commission,
        netProfit: r.netProfit,
        entryCount: r.entryCount,
        playerCount: r.playerCount,
        drawCount: r.drawCount,
      });
    }

    return {
      gameProduct,
      financialDate,
      drawCount: drawAgg.drawCount,
      tenantCount: tenantAggs.length,
    };
  }
}
