/**
 * Lambda: sync-outstanding (Lotto 5/35 – Scheduled Job)
 *
 * EventBridge rule chạy mỗi 5 phút.
 * Aggregate entries WHERE { status: "scheduled" } group by drawId
 * → Upsert lotto535_outstanding_draw_reports với snapshotAt = now (reset TTL).
 *
 * Khi draw settle/void, job không tạo doc mới → TTL tự xoá sau 15 phút.
 *
 * IDEMPOTENT: upsert overwrite — crash-safe.
 */

import { GameProduct } from "@megawin/game-core/entities";
import { LOTTO535_OUTSTANDING_DRAW_REPORTS } from "@megawin/game-lotto535/entities";
import {
  OutstandingReportRepository,
  EntryRepository,
} from "@megawin/game-lotto535-application/repos";
import { SyncSystemOutstandingUseCase } from "@megawin/game-core-application/use-cases";

const outstandingRepo = new OutstandingReportRepository();
const entryRepo = new EntryRepository();
const syncSystemUseCase = new SyncSystemOutstandingUseCase();

export async function handler() {
  // ── Bước 1: Aggregate entries scheduled theo drawId ──────────────────────
  // Group by drawId để lấy entryCount, playerCount, tenantCount, lineCount, totalStake, estimatedCommission
  const drawSnapshots = await entryRepo.aggregateOutstandingByDraw();

  // ── Bước 2: Upsert lotto535_outstanding_draw_reports cho từng draw active ─
  for (const snap of drawSnapshots) {
    await outstandingRepo.upsertDrawReport({
      drawId: snap.drawId,
      financialDate: snap.financialDate,
      entryCount: snap.entryCount,
      playerCount: snap.playerCount,
      tenantCount: snap.tenantCount,
      lineCount: snap.lineCount,
      totalStake: snap.totalStake,
      estimatedCommission: snap.estimatedCommission,
    });
  }

  // ── Bước 3: Sync system outstanding aggregate ────────────────────────────
  const systemResult = await syncSystemUseCase.execute({
    gameProduct: GameProduct.Lotto535,
    outstandingDrawReportCollection: LOTTO535_OUTSTANDING_DRAW_REPORTS,
  });

  return {
    drawsSynced: drawSnapshots.length,
    systemActiveDrawCount: systemResult.activeDrawCount,
    systemTotalStake: systemResult.totalOutstandingStake,
  };
}
