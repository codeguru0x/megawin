/**
 * Use Case: Finalize Void (Bingo 18)
 *
 * Step cuối của Void Draw Step Function.
 * Aggregate tổng kết void từ DB, transition voiding → void + ghi voidSummary (1 atomic query).
 *
 * IDEMPOTENT: aggregate + voidComplete atomic.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { VoidContext } from "./types";

export interface FinalizeVoidResult {
  /** ID kỳ quay. */
  drawId: string;
  /** Trạng thái sau khi finalize (void). */
  status: string;
  /** Tổng entries đã void thành công. */
  totalVoidedEntries: number;
  /** Tổng tiền gốc (VND) — Σ(entry.amount). */
  totalOriginalAmount: number;
  /** Tổng tiền hoàn (VND) — Σ(voidInfo.refundAmount). */
  totalRefundAmount: number;
  /** Thời điểm hoàn tất void (ISO 8601). */
  completedAt: string;
}

export class FinalizeVoidUseCase extends InternalUseCase<
  VoidContext,
  FinalizeVoidResult
> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();

  protected async execute(input: VoidContext): Promise<FinalizeVoidResult> {
    const { drawId } = input;
    const summary = await this.entryRepo.aggregateVoidRefundSummary(drawId);
    const completedAt = new Date();

    const updated = await this.drawRepo.voidComplete(drawId, {
      totalVoidedEntries: summary.totalVoidedEntries,
      totalOriginalAmount: summary.totalOriginalAmount,
      totalRefundAmount: summary.totalRefundAmount,
      completedAt,
    });

    if (!updated) {
      const draw = await this.drawRepo.getDrawById(drawId);
      if (draw?.status === DrawStatus.Void) {
        console.log(`Draw ${drawId} already void, skipping transition.`);
      } else {
        throw new Error(
          `Cannot finalize void draw ${drawId}. Current status: ${draw?.status}`,
        );
      }
    }

    return {
      drawId,
      status: DrawStatus.Void,
      totalVoidedEntries: summary.totalVoidedEntries,
      totalOriginalAmount: summary.totalOriginalAmount,
      totalRefundAmount: summary.totalRefundAmount,
      completedAt: completedAt.toISOString(),
    };
  }
}
