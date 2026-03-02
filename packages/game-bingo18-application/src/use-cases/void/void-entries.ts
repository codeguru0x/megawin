/**
 * Use Case: Void Entries Batch (Bingo 18)
 *
 * Step 2 (loop) của Void Draw Step Function.
 * Void 1 batch entries — CHỈ xử lý entries, KHÔNG update ticket.
 *
 * CRASH-SAFE: query chỉ voidable entries (scheduled).
 * done = true khi không còn entries voidable.
 *
 * Ticket summary sẽ được SyncTicketSummaries recompute từ entries.
 */

import { StepFunctionUseCase } from "@megawin/app-core/use-cases";
import { EntryRepository } from "../../infras/repos/entry-repo";

export interface VoidEntriesBatchInput {
  /** ID kỳ quay đang void. */
  drawId: string;
  /** Lý do huỷ (ghi vào từng entry). */
  reason: string;
  /** ID người thực hiện huỷ. */
  voidedBy?: string;
  /** Số entries xử lý mỗi batch. Default 100. */
  batchSize?: number;
}

export interface VoidEntriesBatchResult {
  /** ID kỳ quay. */
  drawId: string;
  /** true khi không còn entries voidable → kết thúc loop. */
  done: boolean;
  /** Số entries đã void thành công trong batch. */
  batchVoided: number;
  /** Số entries bị skip (đã void trước đó hoặc race condition). */
  batchSkipped: number;
  /** Tổng tiền hoàn trả batch = Σ(entry.amount). */
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
