/**
 * Use Case: Read Feed Sync Cursor
 *
 * Đọc lastVersion từ feedSyncCursor cho scheduler Lambda.
 * Mỗi game extends và implement getGameProduct().
 */

import { StepFunctionUseCase } from "@megawin/app-core/use-cases";
import type { GameProduct } from "@megawin/game-core/entities";
import { FeedSyncCursorRepository } from "../infras/repos/feed-sync-cursor-repo";

export interface ReadFeedCursorInput {}

export interface ReadFeedCursorResult {
  afterVersion: string;
}

export abstract class BaseReadFeedCursorUseCase extends StepFunctionUseCase<
  ReadFeedCursorInput,
  ReadFeedCursorResult
> {
  private readonly cursorRepo = new FeedSyncCursorRepository();

  protected abstract getGameProduct(): GameProduct;

  protected async execute(_input: ReadFeedCursorInput): Promise<ReadFeedCursorResult> {
    const afterVersion = await this.cursorRepo.getLastVersion(this.getGameProduct());
    return { afterVersion };
  }
}
