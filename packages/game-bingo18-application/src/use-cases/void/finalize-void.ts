/**
 * Use Case: Finalize Void (Bingo 18)
 *
 * Step 4 (cuối) của Void Draw Step Function.
 * Aggregate tổng kết void từ DB, ghi voidSummary lên draw document.
 *
 * IDEMPOTENT: aggregate + overwrite.
 */

import { StepFunctionUseCase } from "@megawin/app-core/use-cases";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";

export interface FinalizeVoidInput {
  /** ID kỳ quay cần finalize void. */
  drawId: string;
}

export interface FinalizeVoidResult {
  /** ID kỳ quay. */
  drawId: string;
  /** Tổng entries đã void. */
  totalVoidedEntries: number;
  /** Tổng tiền gốc trước khi void (VND) = Σ(entry.originalAmount). */
  totalOriginalAmount: number;
  /** Tổng tiền hoàn trả (VND) = Σ(entry.refundAmount). Thường bằng totalOriginalAmount. */
  totalRefundAmount: number;
  /** Thời điểm hoàn tất void (ISO 8601). */
  completedAt: string;
}

export class FinalizeVoidUseCase extends StepFunctionUseCase<
  FinalizeVoidInput,
  FinalizeVoidResult
> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();

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
