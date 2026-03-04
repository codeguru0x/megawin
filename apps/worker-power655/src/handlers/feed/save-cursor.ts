/**
 * Lambda: feed-save-cursor (Power 6/55)
 *
 * Ghi lastVersion vào feedSyncCursor sau khi step function loop hoàn tất.
 * State cuối trong step function – đảm bảo cursor được persist.
 *
 * @input  { lastVersion }
 * @output SaveFeedCursorResult
 */

import {
  SaveFeedCursorUseCase,
  type SaveFeedCursorInput,
} from "@megawin/game-power655-application/use-cases/feed";

const useCase = new SaveFeedCursorUseCase();

export async function handler(event: SaveFeedCursorInput) {
  return useCase.run(event);
}
