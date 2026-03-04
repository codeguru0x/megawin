/**
 * Use Case: Finalize Void (Lotto 5/35)
 *
 * Step 4 (cuối) của Void Draw Step Function.
 * Cập nhật draw document với tổng kết void: tổng tiền huỷ, entries voided, refund summary.
 *
 * IDEMPOTENT: aggregate từ DB, ghi đè voidSummary trên draw.
 *
 * Sau step này, draw đã ở trạng thái "void" (chuyển từ prepareVoid).
 * Step chỉ ghi thêm summary data.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";

export interface FinalizeVoidInput {
  /** Mã kỳ quay cần finalize void. */
  drawId: string;
}

export interface FinalizeVoidResult {
  /** Mã kỳ quay. */
  drawId: string;
  /** Tổng entries đã void. */
  totalVoidedEntries: number;
  /** Tổng số tiền gốc (VND) = Σ(entry.voidInfo.originalAmount). */
  totalOriginalAmount: number;
  /**
   * Tổng tiền hoàn (VND) = Σ(entry.voidInfo.refundAmount).
   * Hiện tại refundAmount = originalAmount (hoàn 100%).
   */
  totalRefundAmount: number;
  /** Thời điểm hoàn thành void (ISO 8601). */
  completedAt: string;
}

export class FinalizeVoidUseCase extends InternalUseCase<
  FinalizeVoidInput,
  FinalizeVoidResult
> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();

  /** Aggregate void summary từ DB và ghi vào draw document. */
  protected async execute(input: FinalizeVoidInput): Promise<FinalizeVoidResult> {
    const { drawId } = input;
    const summary = await this.entryRepo.aggregateVoidRefundSummary(drawId);
    const completedAt = new Date();

    await this.drawRepo.updateVoidSummary(drawId, {
      totalVoidedEntries: summary.totalVoidedEntries,
      totalOriginalAmount: summary.totalOriginalAmount,
      totalRefundAmount: summary.totalRefundAmount,
      completedAt,
    });

    return {
      drawId,
      totalVoidedEntries: summary.totalVoidedEntries,
      totalOriginalAmount: summary.totalOriginalAmount,
      totalRefundAmount: summary.totalRefundAmount,
      completedAt: completedAt.toISOString(),
    };
  }
}
