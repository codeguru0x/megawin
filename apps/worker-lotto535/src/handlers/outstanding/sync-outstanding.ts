/**
 * Lambda: sync-outstanding (Lotto 5/35 – Scheduled Job)
 *
 * EventBridge rule chạy mỗi 5 phút.
 * Aggregate entries WHERE { status: "scheduled" } group by drawId
 * → Upsert per-game outstanding_draw_reports với snapshotAt = now (reset TTL).
 * → Sync lên system outstanding aggregate.
 *
 * IDEMPOTENT: upsert overwrite — crash-safe.
 */

import { SyncOutstandingUseCase } from "@megawin/game-lotto535-application/use-cases/reports";

const syncOutstandingUseCase = new SyncOutstandingUseCase();

export async function handler() {
  return syncOutstandingUseCase.run();
}
