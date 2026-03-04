/**
 * Lambda: feed-sync-entries (Keno)
 *
 * Worker sync entry data từ kenoTicketEntries → entryFeed (game-core).
 * Step Function loop: gọi lặp lại cho đến khi done = true.
 *
 * @input SyncEntryFeedInput
 */

import {
  SyncEntryFeedUseCase,
  type SyncEntryFeedInput,
} from "@megawin/game-keno-application/use-cases/feed";

const useCase = new SyncEntryFeedUseCase();

export async function handler(event: SyncEntryFeedInput) {
  return useCase.run({
    afterVersion: event.afterVersion ?? "0",
    batchSize: event.batchSize,
  });
}
