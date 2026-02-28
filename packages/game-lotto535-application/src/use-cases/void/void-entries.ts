/**
 * Use Case: Void Entries Batch (Lotto 5/35)
 *
 * Step 2 (loop) của Void Draw Step Function.
 * Void 1 batch entries — CHỈ xử lý entries, KHÔNG update ticket.
 *
 * CRASH-SAFE:
 *   - Luôn query entries có status voidable (scheduled/active/drawn)
 *   - voidEntry() atomic: chỉ update nếu status đúng
 *   - done = true khi không còn entries voidable
 *
 * Ticket summary sẽ được SyncTicketSummaries recompute từ entries.
 */

import { StepFunctionUseCase } from "@megawin/app-core/use-cases";
import { EntryRepository } from "../../infras/repos/entry-repo";

export interface VoidEntriesBatchInput {
  drawId: string;
  reason: string;
  voidedBy?: string;
  batchSize?: number;
}

export interface VoidEntriesBatchResult {
  drawId: string;
  done: boolean;
  batchVoided: number;
  batchSkipped: number;
  totalRefundAmount: number;
}

const DEFAULT_BATCH_SIZE = 100;

export class VoidEntriesBatchUseCase extends StepFunctionUseCase<
  VoidEntriesBatchInput,
  VoidEntriesBatchResult
> {
  private readonly entryRepo = new EntryRepository();

  protected async execute(
    input: VoidEntriesBatchInput
  ): Promise<VoidEntriesBatchResult> {
    const { drawId, reason, voidedBy, batchSize = DEFAULT_BATCH_SIZE } = input;
    const entries = await this.entryRepo.getVoidableEntriesBatch(
      drawId,
      batchSize
    );

    if (entries.length === 0) {
      return {
        drawId,
        done: true,
        batchVoided: 0,
        batchSkipped: 0,
        totalRefundAmount: 0,
      };
    }

    let batchVoided = 0;
    let batchSkipped = 0;
    let totalRefundAmount = 0;

    for (const entry of entries) {
      const entryId = (entry as any)._id?.toString?.() ?? (entry as any).id;
      const originalAmount = (entry as any).amount ?? 0;
      const refundAmount = originalAmount;

      const voided = await this.entryRepo.voidEntry(entryId, {
        reason,
        originalAmount,
        refundAmount,
        voidedBy,
      });

      if (!voided) {
        batchSkipped++;
        continue;
      }

      batchVoided++;
      totalRefundAmount += refundAmount;
    }

    return {
      drawId,
      done: false,
      batchVoided,
      batchSkipped,
      totalRefundAmount,
    };
  }
}
