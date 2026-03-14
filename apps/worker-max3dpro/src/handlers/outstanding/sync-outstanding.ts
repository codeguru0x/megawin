/**
 * Lambda: sync-outstanding (Max 3D Pro – Scheduled Job)
 *
 * EventBridge rule chạy mỗi 5 phút.
 * Aggregate entries WHERE { status: "scheduled" } group by drawId
 * → Upsert per-game outstanding_draw_reports với snapshotAt = now (reset TTL).
 * → Sync lên system outstanding aggregate.
 *
 * IDEMPOTENT: upsert overwrite — crash-safe.
 */

import { GameProduct } from "@megawin/game-core/entities";
import {
  OutstandingReportRepository,
  EntryRepository,
  SystemOutstandingRepo,
} from "@megawin/game-max3dpro-application/repos";
import { SyncSystemOutstandingUseCase } from "@megawin/game-core-application/use-cases";

const outstandingRepo = new OutstandingReportRepository();
const entryRepo = new EntryRepository();
const systemOutstandingRepo = new SystemOutstandingRepo();
const syncSystemUseCase = new SyncSystemOutstandingUseCase();

export async function handler() {
  const drawSnapshots = await entryRepo.aggregateOutstandingByDraw();

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

  const systemResult = await syncSystemUseCase.execute({
    gameProduct: GameProduct.Max3dpro,
    outstandingRepo: systemOutstandingRepo,
  });

  return {
    drawsSynced: drawSnapshots.length,
    systemActiveDrawCount: systemResult.activeDrawCount,
    systemTotalStake: systemResult.totalOutstandingStake,
  };
}
