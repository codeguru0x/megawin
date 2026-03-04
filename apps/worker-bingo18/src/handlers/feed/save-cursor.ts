/**
 * Lambda: feed-save-cursor (Bingo 18)
 *
 * Ghi lastVersion vào feedSyncCursor sau khi step function loop hoàn tất.
 * State cuối trong step function – đảm bảo cursor được persist.
 */

import {
  SaveFeedCursorUseCase,
  type SaveFeedCursorInput,
} from "@megawin/game-bingo18-application/use-cases/feed";

const useCase = new SaveFeedCursorUseCase();

export async function handler(event: SaveFeedCursorInput) {
  return useCase.run(event);
}
