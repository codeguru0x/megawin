/**
 * Use Case: Void Entries Batch (Max 3D Pro)
 *
 * Step 2 (loop) của Void Draw Step Function.
 * Void 1 batch entries — CHỈ xử lý entries, KHÔNG update ticket.
 *
 * CRASH-SAFE:
 *   - Luôn query entries có status voidable (scheduled)
 *   - voidEntry() atomic: chỉ update nếu status đúng
 *   - done = true khi không còn entries voidable
 *
 * Ticket summary sẽ được SyncTicketSummaries recompute từ entries.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { EntryRepository } from "../../infras/repos/entry-repo";

export interface VoidEntriesBatchInput {
  /** ID kỳ quay. */
  drawId: string;
  /** Lý do huỷ. */
  reason: string;
  /** Người thực hiện huỷ. */
  voidedBy?: string;
  /** Số entries xử lý mỗi batch (mặc định 100). */
  batchSize?: number;
}

export interface VoidEntriesBatchResult {
  /** ID kỳ quay. */
  drawId: string;
  /** true nếu đã hết entries cần void. */
  done: boolean;
  /** Số entries đã void trong batch này. */
  batchVoided: number;
  /** Số entries bị bỏ qua (đã void hoặc status không hợp lệ). */
  batchSkipped: number;
  /** Tổng tiền cần hoàn trong batch này (VND). */
  totalRefundAmount: number;
}

const DEFAULT_BATCH_SIZE = 100;

export class VoidEntriesBatchUseCase extends InternalUseCase<
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
