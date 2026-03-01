/**
 * Lambda: feed-save-cursor (Power 6/55)
 *
 * Ghi lastVersion vào feedSyncCursor sau khi step function loop hoàn tất.
 * State cuối trong step function – đảm bảo cursor được persist.
 *
 * @input  { lastVersion }
 * @output SaveFeedCursorResult
 */

import { SaveFeedCursorUseCase } from "@megawin/game-power655-application/use-cases/feed";

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
