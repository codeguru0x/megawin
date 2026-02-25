/**
 * Use Case: Save Feed Cursor & Release Lock
 *
 * Ghi lastVersion mới + release distributed lock.
 * Step function gọi ở state cuối sau khi sync hoàn tất.
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
    await this.cursorRepo.saveAndRelease(this.getGameProduct(), input.lastVersion);
    return { saved: true, lastVersion: input.lastVersion };
  }
}
