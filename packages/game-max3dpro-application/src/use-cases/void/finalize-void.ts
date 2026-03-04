/**
 * Use Case: Finalize Void (Max 3D Pro)
 *
 * Step 4 (cuối) của Void Draw Step Function.
 * Cập nhật draw document với tổng kết void: tổng tiền huỷ, entries voided, refund summary.
 *
 * IDEMPOTENT: aggregate từ DB, ghi đè voidSummary trên draw.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
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
  /** Tổng tiền gốc của các entries đã void (VND). */
  totalOriginalAmount: number;
  /** Tổng tiền đã hoàn (VND). */
  totalRefundAmount: number;
  /** Thời điểm hoàn tất void (ISO 8601). */
  completedAt: string;
}

export class FinalizeVoidUseCase extends InternalUseCase<
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
