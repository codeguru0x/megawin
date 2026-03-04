/**
 * Lambda: feed-sync-entries (Bingo 18)
 *
 * Worker sync entry data từ bingo18TicketEntries → entryFeed (game-core).
 * Step Function loop: gọi lặp lại cho đến khi done = true.
 */

import {
  SyncEntryFeedUseCase,
  type SyncEntryFeedInput,
} from "@megawin/game-bingo18-application/use-cases/feed";

const useCase = new SyncEntryFeedUseCase();

export async function handler(event: SyncEntryFeedInput) {
  return useCase.run({
    afterVersion: event.afterVersion ?? "0",
    batchSize: event.batchSize,
  });
}
