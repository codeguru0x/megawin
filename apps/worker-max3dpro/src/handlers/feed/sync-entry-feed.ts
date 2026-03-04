/**
 * Lambda: feed-sync-entries (Max 3D Pro)
 *
 * Worker sync entry data từ max3dproTicketEntries → entryFeed (game-core).
 * Step Function loop: gọi lặp lại cho đến khi done = true.
 *
 * CRASH-SAFE: scan bằng version, upsert idempotent.
 *
 * @input  { afterVersion: string, batchSize?: number }
 * @output SyncEntryFeedResult
 */

import {
  SyncEntryFeedUseCase,
  type SyncEntryFeedInput,
} from "@megawin/game-max3dpro-application/use-cases/feed";

const useCase = new SyncEntryFeedUseCase();

export async function handler(event: SyncEntryFeedInput) {
  return useCase.run({
    afterVersion: event.afterVersion ?? "0",
    batchSize: event.batchSize,
  });
}
