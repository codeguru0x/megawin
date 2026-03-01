/**
 * Lambda: feed-sync-entries (Mega 6/45)
 *
 * Worker sync entry data từ mega645TicketEntries → entryFeed (game-core).
 * Chạy định kỳ (scheduler) hoặc trigger sau settle/void.
 *
 * Step Function loop: gọi lặp lại cho đến khi done = true.
 *
 * CRASH-SAFE: scan bằng version, upsert idempotent.
 *
 * @input  { afterVersion: string, batchSize?: number }
 * @output SyncEntryFeedResult
 */

import { SyncEntryFeedUseCase } from "@megawin/game-mega645-application/use-cases/feed";

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
