/**
 * Lambda: sync-outstanding (Max 3D Pro – Scheduled Job)
 *
 * EventBridge rule chạy mỗi 5 phút.
 * Aggregate entries WHERE { status: "scheduled" } group by drawId
 * → Upsert max3dpro_outstanding_draw_reports với snapshotAt = now (reset TTL).
 *
 * Khi draw settle/void, job không tạo doc mới → TTL tự xoá sau 15 phút.
 * Max 3D Pro CÓ lineCount — aggregate lineCount (pairs per board).
 *
 * IDEMPOTENT: upsert overwrite — crash-safe.
 */

import { GameProduct } from "@megawin/game-core/entities";
import { MAX3DPRO_OUTSTANDING_DRAW_REPORTS } from "@megawin/game-max3dpro/entities";
import {
  OutstandingReportRepository,
  EntryRepository,
} from "@megawin/game-max3dpro-application/repos";
import { SyncSystemOutstandingUseCase } from "@megawin/game-core-application/use-cases";

const outstandingRepo = new OutstandingReportRepository();
const entryRepo = new EntryRepository();
const syncSystemUseCase = new SyncSystemOutstandingUseCase();

export async function handler() {
  // ── Bước 1: Aggregate entries scheduled theo drawId ──────────────────────
  // Group by drawId → entryCount, playerCount, tenantCount, lineCount, totalStake, estimatedCommission
  // Max 3D Pro CÓ lineCount — aggregateOutstandingByDraw trả lineCount (pairs)
  const drawSnapshots = await entryRepo.aggregateOutstandingByDraw();

  // ── Bước 2: Upsert max3dpro_outstanding_draw_reports cho từng draw active ─
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
    gameProduct: GameProduct.Max3dpro,
    outstandingDrawReportCollection: MAX3DPRO_OUTSTANDING_DRAW_REPORTS,
  });

  return {
    drawsSynced: drawSnapshots.length,
    systemActiveDrawCount: systemResult.activeDrawCount,
    systemTotalStake: systemResult.totalOutstandingStake,
  };
}
