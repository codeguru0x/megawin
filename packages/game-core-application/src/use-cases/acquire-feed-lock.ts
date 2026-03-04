/**
 * Use Case: Acquire Feed Sync Lock
 *
 * Atomic operation: acquire lock + đọc afterVersion.
 * Scheduler gọi trước khi start step function.
 *
 * Nếu acquired=false → step function khác đang chạy → skip.
 * Nếu acquired=true → an toàn start step function với afterVersion.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import type { GameProduct } from "@megawin/game-core/entities";
import { FeedSyncCursorRepository } from "../infras/repos/feed-sync-cursor-repo";

export interface AcquireFeedLockInput {
  executionId: string;
}

export interface AcquireFeedLockResult {
  acquired: boolean;
  afterVersion: string;
}

export abstract class BaseAcquireFeedLockUseCase extends InternalUseCase<
  AcquireFeedLockInput,
  AcquireFeedLockResult
> {
  private readonly cursorRepo = new FeedSyncCursorRepository();

  protected abstract getGameProduct(): GameProduct;

  protected async execute(input: AcquireFeedLockInput): Promise<AcquireFeedLockResult> {
    return this.cursorRepo.acquireLock(this.getGameProduct(), input.executionId);
  }
}
