/**
 * Lambda: feed-sync-entries (Keno)
 *
 * Worker sync entry data từ kenoTicketEntries → entryFeed (game-core).
 * Step Function loop: gọi lặp lại cho đến khi done = true.
 */

import { SyncEntryFeedUseCase } from "@megawin/game-keno-application/use-cases/feed";

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
