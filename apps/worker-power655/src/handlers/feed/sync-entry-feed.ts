/**
 * Lambda: feed-sync-entries (Power 6/55)
 *
 * Worker sync entry data từ power655TicketEntries → entryFeed (game-core).
 * Chạy định kỳ (scheduler) hoặc trigger sau settle/void.
 *
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
} from "@megawin/game-power655-application/use-cases/feed";

const useCase = new SyncEntryFeedUseCase();

export async function handler(event: SyncEntryFeedInput) {
  return useCase.run({
    afterVersion: event.afterVersion ?? "0",
    batchSize: event.batchSize,
  });
}
