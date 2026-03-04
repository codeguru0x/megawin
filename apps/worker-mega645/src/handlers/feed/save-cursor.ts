/**
 * Lambda: feed-save-cursor (Mega 6/45)
 *
 * Ghi lastVersion vào feedSyncCursor sau khi step function loop hoàn tất.
 * State cuối trong step function – đảm bảo cursor được persist.
 */

import {
  SaveFeedCursorUseCase,
  type SaveFeedCursorInput,
} from "@megawin/game-mega645-application/use-cases/feed";

const useCase = new SaveFeedCursorUseCase();

export async function handler(event: SaveFeedCursorInput) {
  return useCase.run(event);
}
