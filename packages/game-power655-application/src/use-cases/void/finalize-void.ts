/**
 * Use Case: Finalize Void (Power 6/55)
 *
 * Step 4 (cuối) của Void Draw Step Function.
 * Cập nhật draw document với tổng kết void.
 *
 * IDEMPOTENT: aggregate từ DB, ghi đè voidSummary trên draw.
 */

import { StepFunctionUseCase } from "@megawin/app-core/use-cases";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";

export interface FinalizeVoidInput {
  /** ID kỳ quay cần finalize void. */
  drawId: string;
}

export interface FinalizeVoidResult {
  /** ID kỳ quay đã finalize void. */
  drawId: string;
  /** Tổng số entries đã void. */
  totalVoidedEntries: number;
  /** Tổng số tiền gốc của các entries đã void (VND). */
  totalOriginalAmount: number;
  /** Tổng số tiền đã hoàn trả (VND). */
  totalRefundAmount: number;
  /** Thời điểm hoàn thành void (ISO 8601). */
  completedAt: string;
}

/**
 * Aggregate void summary từ DB và ghi vào draw document Power 6/55.
 */
export class FinalizeVoidUseCase extends StepFunctionUseCase<
  FinalizeVoidInput,
  FinalizeVoidResult
> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();

  /** @inheritdoc */
  protected async execute(
    input: FinalizeVoidInput
  ): Promise<FinalizeVoidResult> {
    const { drawId } = input;
    const summary = await this.entryRepo.aggregateVoidRefundSummary(drawId);
    const completedAt = new Date();

    await this.drawRepo.updateVoidSummary(drawId, {
      reason: "",
      voidedAt: completedAt,
      totalEntriesVoided: summary.totalVoidedEntries,
      totalRefundAmount: summary.totalRefundAmount,
      totalRefundDispatched: 0,
      totalRefundFailed: 0,
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
