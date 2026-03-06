/**
 * Use Case: Void Entries Batch (Keno)
 *
 * Step 2 (loop) của Void Draw Step Function.
 * Xử lý nhiều batch trong 1 lần gọi Lambda, dừng sớm khi sắp hết thời gian.
 *
 * CRASH-SAFE: query chỉ entries status=scheduled → đã void thì tự skip.
 * done = true khi không còn entries voidable.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { VoidContext } from "./types";

export interface VoidEntriesBatchResult {
  drawId: string;
  done: boolean;
}

const BATCH_SIZE = 500;
/** Giới hạn thời gian chạy (ms). Dừng trước Lambda timeout (10 phút) để return an toàn. */
const MAX_EXECUTION_MS = 10 * 60 * 1000;

export class VoidEntriesBatchUseCase extends InternalUseCase<
  VoidContext,
  VoidEntriesBatchResult
> {
  private readonly entryRepo = new EntryRepository();

  protected async execute(input: VoidContext): Promise<VoidEntriesBatchResult> {
    const { drawId } = input;
    const startTime = Date.now();

    while (Date.now() - startTime < MAX_EXECUTION_MS) {
      const entries = await this.entryRepo.getVoidableEntriesBatch(drawId, BATCH_SIZE);

      if (entries.length === 0) {
        return { drawId, done: true };
      }

      const items = entries.map((entry) => ({
        entryId: entry.id,
        amount: entry.amount ?? 0,
      }));

      await this.entryRepo.bulkVoidEntries(items);
    }

    return { drawId, done: false };
  }
}
