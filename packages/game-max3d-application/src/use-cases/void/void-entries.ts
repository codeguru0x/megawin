/**
 * Use Case: Void Entries Batch (Max 3D)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * STEP 2 TRONG VOID FLOW (LOOP — gọi nhiều lần cho đến done=true)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Batch void entries đang ở status "scheduled" cho kỳ bị huỷ.
 * Xử lý nhiều batch trong 1 lần gọi Lambda, dừng sớm khi sắp hết thời gian.
 *
 * CRASH-SAFE: query chỉ entries status=scheduled → đã void thì tự skip.
 * done = true khi không còn entries voidable.
 */

import { UseCase } from "@megawin/app-core/use-cases";
import type { EntryVoidInfo } from "@megawin/game-max3d/entities";
import { generateId } from "@megawin/shared/utils";

import { EntryRepository } from "../../infras/repos/entry-repo";
import type { VoidContext } from "./types";

export interface VoidEntriesBatchResult {
  drawId: string;
  done: boolean;
}

const BATCH_SIZE = 500;
const MAX_EXECUTION_MS = 13 * 60 * 1000;

export class VoidEntriesBatchUseCase extends UseCase<VoidContext, VoidEntriesBatchResult> {
  private readonly entryRepo = new EntryRepository();

  protected async execute(input: VoidContext): Promise<VoidEntriesBatchResult> {
    const { drawId } = input;
    const startTime = Date.now();

    while (Date.now() - startTime < MAX_EXECUTION_MS) {
      const entries = await this.entryRepo.getVoidableEntriesBatch(drawId, BATCH_SIZE);

      if (entries.length === 0) {
        return { drawId, done: true };
      }

      const now = new Date();
      const items = entries.map((entry) => ({
        entryId: entry.id,
        voidInfo: {
          originalAmount: entry.amount ?? 0,
          refundAmount: entry.amount ?? 0,
          voidedAt: now,
          // UUIDv7 idempotency key — mọi entry void đều cần refund tenant.
          refundTx: generateId(),
        } satisfies EntryVoidInfo,
      }));

      await this.entryRepo.bulkVoidEntries(items);
    }

    return { drawId, done: false };
  }
}
