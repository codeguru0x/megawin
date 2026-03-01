/**
 * Use Case: Apply Split Bonuses (Mega 6/45)
 *
 * Patch bonusPerWinner từ Jackpot split vào entry payout.tiers + payout amounts.
 * Chỉ chạy khi isSplitCycle = true.
 * IDEMPOTENT: Check isSplitBonus=true trên tier — nếu đã patch thì skip.
 */

import { StepFunctionUseCase } from "@megawin/app-core/use-cases";
import { EntryRepository } from "../../infras/repos/entry-repo";

export interface ApplySplitBonusesInput {
  drawId: string;
  isSplitCycle: boolean;
  splitDetails?: Record<
    string,
    {
      initialAmount: number;
      redistributedAmount: number;
      totalAmount: number;
      winnerCount: number;
      bonusPerWinner: number;
    }
  >;
}

export interface ApplySplitBonusesResult {
  drawId: string;
  entriesPatched: number;
  skipped: boolean;
}

export class ApplySplitBonusesUseCase extends StepFunctionUseCase<
  ApplySplitBonusesInput,
  ApplySplitBonusesResult
> {
  private readonly entryRepo = new EntryRepository();

  protected async execute(
    input: ApplySplitBonusesInput
  ): Promise<ApplySplitBonusesResult> {
    const { drawId, isSplitCycle, splitDetails } = input;

    if (
      !isSplitCycle ||
      !splitDetails ||
      Object.keys(splitDetails).length === 0
    ) {
      return { drawId, entriesPatched: 0, skipped: true };
    }

    let entriesPatched = 0;

    for (const [tier, detail] of Object.entries(splitDetails)) {
      if (detail.bonusPerWinner <= 0 || detail.winnerCount <= 0) continue;

      const patched = await this.entryRepo.applySplitBonusForTier(
        drawId,
        tier,
        detail.bonusPerWinner
      );
      entriesPatched += patched;
    }

    return { drawId, entriesPatched, skipped: false };
  }
}
