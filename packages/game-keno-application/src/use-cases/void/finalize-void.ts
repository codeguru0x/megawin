/**
 * Use Case: Finalize Void (Keno)
 *
 * Step cuối của Void Draw Step Function.
 * Aggregate tổng kết void từ DB, transition voiding → void + ghi voidSummary (1 atomic query).
 *
 * IDEMPOTENT: aggregate + voidComplete atomic.
 */

import { AppException, InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";

export interface FinalizeVoidInput {
  drawId: string;
}

export interface FinalizeVoidResult {
  drawId: string;
  status: string;
  totalVoidedEntries: number;
  totalOriginalAmount: number;
  totalRefundAmount: number;
  completedAt: string;
}

export class FinalizeVoidUseCase extends InternalUseCase<FinalizeVoidInput, FinalizeVoidResult> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();

  protected async execute(input: FinalizeVoidInput): Promise<FinalizeVoidResult> {
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
        throw AppException.businessRuleViolation(
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
