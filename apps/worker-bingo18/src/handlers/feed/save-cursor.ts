/**
 * Lambda: feed-save-cursor (Bingo 18)
 *
 * Ghi lastVersion vào feedSyncCursor sau khi step function loop hoàn tất.
 * State cuối trong step function – đảm bảo cursor được persist.
 */

import { SaveFeedCursorUseCase } from "@megawin/game-bingo18-application/use-cases/feed";

interface Input {
  lastVersion: string;
}

const useCase = new SaveFeedCursorUseCase();

export async function handler(event: Input) {
  const result = await useCase.run({
    lastVersion: event.lastVersion,
  });
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}
