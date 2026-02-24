/**
 * Use Case: Save Feed Sync Cursor
 *
 * Ghi lastVersion vào feedSyncCursor sau khi step function sync hoàn tất.
 * Mỗi game extends và implement getGameProduct().
 */

import { StepFunctionUseCase } from "@megawin/app-core/use-cases";
import type { GameProduct } from "@megawin/game-core/entities";
import { FeedSyncCursorRepository } from "../infras/repos/feed-sync-cursor-repo";

export interface SaveFeedCursorInput {
  lastVersion: string;
}

export interface SaveFeedCursorResult {
  saved: boolean;
  lastVersion: string;
}

export abstract class BaseSaveFeedCursorUseCase extends StepFunctionUseCase<
  SaveFeedCursorInput,
  SaveFeedCursorResult
> {
  private readonly cursorRepo = new FeedSyncCursorRepository();

  protected abstract getGameProduct(): GameProduct;

  protected async execute(input: SaveFeedCursorInput): Promise<SaveFeedCursorResult> {
    await this.cursorRepo.saveLastVersion(this.getGameProduct(), input.lastVersion);
    return { saved: true, lastVersion: input.lastVersion };
  }
}
