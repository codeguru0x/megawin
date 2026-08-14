/**
 * Use Case: Sync Outstanding (Bingo 18)
 *
 * Scheduled job (mỗi 5 phút) gọi use case này để:
 *   1. Lấy active drawIds (draws chưa settled/void) từ DrawRepo
 *   2. Chạy song song 2 queries trên EntryRepo:
 *      - Query A: metrics số học (entryCount, stake, commission)
 *      - Query B: đếm unique players và tenants dùng double-$group (tránh $addToSet array lớn)
 *   3. Merge kết quả → bulk upsert bingo18_outstanding_draw_reports (1 DB call)
 *   4. Sync lên system_outstanding_game_daily qua SyncSystemOutstandingUseCase
 *
 * IDEMPOTENT: upsert overwrite — crash-safe, retry an toàn ở mọi điểm crash.
 * TTL: snapshotAt reset mỗi lần sync → doc tự expire 15 phút sau khi draw settle/void.
 *
 * Bingo 18 không có lineCount — field này không có trong upsert payload.
 */

import { UseCase } from "@megawin/app-core/use-cases";
import type { UnfinishedDrawStatus } from "@megawin/game-core/entities";
import { DrawStatus, GameProduct } from "@megawin/game-core/entities";
import { SyncSystemOutstandingUseCase } from "@megawin/game-core-application/use-cases";

import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { OutstandingReportRepository } from "../../infras/repos/outstanding-report-repo";
import { SystemOutstandingRepo } from "../../infras/repos/system-outstanding-repo";

/** Kỳ có thể còn outstanding stake — loại Scheduled (chưa mở bán) và Voiding (đã hoàn tiền). */
const OUTSTANDING_STATUSES: readonly UnfinishedDrawStatus[] = [
  DrawStatus.SalesOpen,
  DrawStatus.SalesClosed,
  DrawStatus.Published,
  DrawStatus.Settling,
];

export interface SyncOutstandingResult {
  /** Số draw đã upsert outstanding report. */
  drawsSynced: number;
  /** Số draw active theo system outstanding report. */
  systemActiveDrawCount: number;
  /** Tổng stake outstanding theo system outstanding report (VND). */
  systemTotalStake: number;
}

/**
 * Aggregate entries outstanding → upsert per-game draw reports → sync lên system.
 *
 * CRASH-SAFE: upsert overwrite toàn bộ — idempotent, chạy lại cho cùng kết quả.
 * Handler chỉ được gọi use case này, không được gọi repo trực tiếp.
 */
export class SyncOutstandingUseCase extends UseCase<void, SyncOutstandingResult> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();
  private readonly outstandingRepo = new OutstandingReportRepository();
  private readonly systemOutstandingRepo = new SystemOutstandingRepo();
  private readonly syncSystemUseCase = new SyncSystemOutstandingUseCase();

  protected async execute(_input: void): Promise<SyncOutstandingResult> {
    // ── Bước 1: Lấy drawIds active để tăng selectivity cho entry queries ────
    // Bingo 18 có ~160 kỳ/ngày. getUnfinishedDraws (KHÔNG lookback ngày) — không bỏ sót kỳ kẹt
    // cũ hơn lookbackDays trước đây (status là equality prefix của idx_status_drawId_desc,
    // IXSCAN chỉ chạm vài chục kỳ unfinished dù collection có hàng triệu doc Settled).
    // Thêm drawId vào $match giúp MongoDB dùng index { drawId: 1, status: 1 }
    // thay vì scan toàn bộ collection theo status.
    const activeDraws = await this.drawRepo.getUnfinishedDraws(OUTSTANDING_STATUSES);
    const activeDrawIds = activeDraws.map((d) => d.drawId);

    if (activeDrawIds.length === 0) {
      // Không có draw active → không có gì để sync
      return {
        drawsSynced: 0,
        systemActiveDrawCount: 0,
        systemTotalStake: 0,
      };
    }

    // ── Bước 2: Chạy song song 2 queries aggregate entry ────────────────────
    // Query A: metrics số học (không $addToSet → memory nhỏ, constant)
    // Query B: unique player + tenant count (double-$group → tránh array lớn trong RAM)
    // Bingo 18 không có lineCount.
    const [metricsResults, countsResults] = await Promise.all([
      this.entryRepo.aggregateOutstandingMetricsByDraw(activeDrawIds),
      this.entryRepo.aggregateOutstandingCountsByDraw(activeDrawIds),
    ]);

    // ── Bước 3: Merge Query A + Query B theo drawId ──────────────────────────
    // Build lookup map từ Query B để merge O(n) thay vì O(n²)
    const countsMap = new Map(countsResults.map((c) => [c.drawId, c]));

    // ── Bước 4: Bulk upsert per-game outstanding draw reports (1 DB call) ───
    // Build array snapshots trước → gọi bulkUpsertDrawReports 1 lần duy nhất.
    // Mỗi doc reset snapshotAt = now → TTL 15 phút reset.
    // Draw đã settle/void sẽ không còn trong activeDrawIds → không upsert mới → doc tự expire.
    const snapshots = metricsResults.map((metrics) => {
      const counts = countsMap.get(metrics.drawId);
      return {
        drawId: metrics.drawId,
        financialDate: metrics.financialDate,
        entryCount: metrics.entryCount,
        playerCount: counts?.playerCount ?? 0,
        tenantCount: counts?.tenantCount ?? 0,
        totalStake: metrics.totalStake,
        estimatedCommission: metrics.estimatedCommission,
      };
    });

    await this.outstandingRepo.bulkUpsertDrawReports(snapshots);

    // ── Bước 5: Sync lên system_outstanding_game_daily ───────────────────────
    // Aggregate toàn bộ bingo18_outstanding_draw_reports → upsert system snapshot.
    const systemResult = await this.syncSystemUseCase.run({
      gameProduct: GameProduct.Bingo18,
      gameOutstandingRepo: this.systemOutstandingRepo,
    });

    return {
      drawsSynced: metricsResults.length,
      systemActiveDrawCount: systemResult.activeDrawCount,
      systemTotalStake: systemResult.totalOutstandingStake,
    };
  }
}
