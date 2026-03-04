import { InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";

export interface FinalizeVoidInput {
  /** ID kỳ quay cần hoàn tất huỷ. */
  drawId: string;
}

export interface FinalizeVoidResult {
  /** ID kỳ quay đã hoàn tất huỷ. */
  drawId: string;
  /** Tổng số entry đã void. */
  totalVoidedEntries: number;
  /** Tổng tiền gốc của các entry đã void (VND). */
  totalOriginalAmount: number;
  /** Tổng tiền đã hoàn trả (VND) — thường bằng totalOriginalAmount. */
  totalRefundAmount: number;
  /** Thời điểm hoàn tất void (ISO datetime). */
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
