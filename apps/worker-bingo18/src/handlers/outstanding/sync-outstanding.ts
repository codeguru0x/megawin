/**
 * Lambda: sync-outstanding (Bingo 18 – Scheduled Job)
 *
 * EventBridge rule chạy mỗi 5 phút.
 * Aggregate entries WHERE { status: "scheduled" } group by drawId
 * → Upsert bingo18_outstanding_draw_reports với snapshotAt = now (reset TTL).
 *
 * Khi draw settle/void, job không tạo doc mới → TTL tự xoá sau 15 phút.
 * Bingo 18 KHÔNG có lineCount — không aggregate lineCount.
 *
 * IDEMPOTENT: upsert overwrite — crash-safe.
 */

import { GameProduct } from "@megawin/game-core/entities";
import { BINGO18_OUTSTANDING_DRAW_REPORTS } from "@megawin/game-bingo18/entities";
import {
  OutstandingReportRepository,
  EntryRepository,
} from "@megawin/game-bingo18-application/repos";
import { SyncSystemOutstandingUseCase } from "@megawin/game-core-application/use-cases";

const outstandingRepo = new OutstandingReportRepository();
const entryRepo = new EntryRepository();
const syncSystemUseCase = new SyncSystemOutstandingUseCase();

export async function handler() {
  // ── Bước 1: Aggregate entries scheduled theo drawId ──────────────────────
  // Group by drawId → entryCount, playerCount, tenantCount, totalStake, estimatedCommission
  // Bingo 18 KHÔNG có lineCount — aggregateOutstandingByDraw không trả lineCount
  const drawSnapshots = await entryRepo.aggregateOutstandingByDraw();

  // ── Bước 2: Upsert bingo18_outstanding_draw_reports cho từng draw active ──
  for (const snap of drawSnapshots) {
    await outstandingRepo.upsertDrawReport({
      drawId: snap.drawId,
      financialDate: snap.financialDate,
      entryCount: snap.entryCount,
      playerCount: snap.playerCount,
      tenantCount: snap.tenantCount,
      totalStake: snap.totalStake,
      estimatedCommission: snap.estimatedCommission,
    });
  }

  // ── Bước 3: Sync system outstanding aggregate ────────────────────────────
  const systemResult = await syncSystemUseCase.execute({
    gameProduct: GameProduct.Bingo18,
    outstandingDrawReportCollection: BINGO18_OUTSTANDING_DRAW_REPORTS,
  });

  return {
    drawsSynced: drawSnapshots.length,
    systemActiveDrawCount: systemResult.activeDrawCount,
    systemTotalStake: systemResult.totalOutstandingStake,
  };
}
