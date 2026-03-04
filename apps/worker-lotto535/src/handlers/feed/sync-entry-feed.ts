/**
 * Lambda: feed-sync-entries (Lotto 5/35)
 *
 * Worker sync entry data từ lotto535TicketEntries → entryFeed (game-core).
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
} from "@megawin/game-lotto535-application/use-cases/feed";

const useCase = new SyncEntryFeedUseCase();

export async function handler(event: SyncEntryFeedInput) {
  return useCase.run({
    afterVersion: event.afterVersion ?? "0",
    batchSize: event.batchSize,
  });
}
