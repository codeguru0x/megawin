/**
 * Lambda: feed-sync-entries (Bingo 18)
 *
 * Worker sync entry data từ bingo18TicketEntries → entryFeed (game-core).
 * Step Function loop: gọi lặp lại cho đến khi done = true.
 */

import { SyncEntryFeedUseCase } from "@megawin/game-bingo18-application/use-cases/feed";

interface Input {
  afterVersion: string;
  batchSize?: number;
}

const useCase = new SyncEntryFeedUseCase();

export async function handler(event: Input) {
  const result = await useCase.run({
    afterVersion: event.afterVersion ?? "0",
    batchSize: event.batchSize,
  });
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}
