/**
 * Lambda: feed-save-cursor (Keno)
 *
 * Ghi lastVersion vào feedSyncCursor sau khi step function loop hoàn tất.
 * State cuối trong step function – đảm bảo cursor được persist.
 *
 * @input SaveFeedCursorInput
 */

import {
  SaveFeedCursorUseCase,
  type SaveFeedCursorInput,
} from "@megawin/game-keno-application/use-cases/feed";

const useCase = new SaveFeedCursorUseCase();

export async function handler(event: SaveFeedCursorInput) {
  return useCase.run(event);
}
