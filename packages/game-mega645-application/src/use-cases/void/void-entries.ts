import { StepFunctionUseCase } from "@megawin/app-core/use-cases";
import { EntryRepository } from "../../infras/repos/entry-repo";

export interface VoidEntriesBatchInput {
  /** ID kỳ quay đang huỷ. */
  drawId: string;
  /** Lý do huỷ (ghi vào mỗi entry). */
  reason: string;
  /** Người thực hiện huỷ. */
  voidedBy?: string;
  /** Số entry xử lý mỗi batch (mặc định 100). */
  batchSize?: number;
}

export interface VoidEntriesBatchResult {
  /** ID kỳ quay. */
  drawId: string;
  /** true nếu đã xử lý hết tất cả entry (hết dữ liệu). */
  done: boolean;
  /** Số entry đã void thành công trong batch. */
  batchVoided: number;
  /** Số entry bị bỏ qua (do race condition hoặc đã void trước đó). */
  batchSkipped: number;
  /** Tổng tiền hoàn trả trong batch (VND) = Σ refundAmount. */
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
      return { drawId, done: true, batchVoided: 0, batchSkipped: 0, totalRefundAmount: 0 };
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

    return { drawId, done: false, batchVoided, batchSkipped, totalRefundAmount };
  }
}
