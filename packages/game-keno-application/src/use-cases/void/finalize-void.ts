/**
 * Use Case: Finalize Void (Keno)
 *
 * Step 4 (cuối) của Void Draw Step Function.
 * Aggregate tổng kết void từ DB, ghi voidSummary lên draw document.
 *
 * IDEMPOTENT: aggregate + overwrite.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";

export interface FinalizeVoidInput {
  drawId: string;
}

export interface FinalizeVoidResult {
  drawId: string;
  totalVoidedEntries: number;
  totalOriginalAmount: number;
  totalRefundAmount: number;
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
