/**
 * Use Case: Finalize Void (Power 6/55)
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
  drawId: string;
  status: string;
  totalVoidedEntries: number;
  totalRefundAmount: number;
  completedAt: string;
}

export class FinalizeVoidUseCase extends InternalUseCase<VoidContext, FinalizeVoidResult> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();

  protected async execute(input: VoidContext): Promise<FinalizeVoidResult> {
    const { drawId } = input;
    const draw = await this.drawRepo.getDrawById(drawId);
    const summary = await this.entryRepo.aggregateVoidRefundSummary(drawId);
    const completedAt = new Date();

    const updated = await this.drawRepo.voidComplete(drawId, {
      reason: (draw as any)?.voidInfo?.reason ?? "",
      voidedBy: (draw as any)?.voidInfo?.voidedBy,
      voidedAt: (draw as any)?.voidInfo?.voidedAt ?? completedAt,
      totalEntriesVoided: summary.totalVoidedEntries,
      totalRefundAmount: summary.totalRefundAmount,
      totalRefundDispatched: summary.totalVoidedEntries,
      totalRefundFailed: 0,
    });

    if (!updated) {
      if (draw?.status === DrawStatus.Void) {
        console.log(`Draw ${drawId} already void, skipping transition.`);
      } else {
        throw new Error(`Cannot finalize void draw ${drawId}. Current status: ${draw?.status}`);
      }
    }

    return {
      drawId,
      status: DrawStatus.Void,
      totalVoidedEntries: summary.totalVoidedEntries,
      totalRefundAmount: summary.totalRefundAmount,
      completedAt: completedAt.toISOString(),
    };
  }
}
