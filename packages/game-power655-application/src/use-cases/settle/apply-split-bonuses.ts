/**
 * Use Case: Apply Split Bonuses (Power 6/55)
 *
 * Patch bonusPerWinner từ Jackpot split vào entry payout.tiers + payout amounts.
 * Chạy SAU CalculateFinancials, TRƯỚC SyncTicketSummaries.
 *
 * Chỉ chạy khi isSplitCycle = true.
 *
 * IDEMPOTENT: Check isSplitBonus=true trên tier — nếu đã patch thì skip.
 * Lines KHÔNG bị update (giữ immutable) — split bonus chỉ ở mức entry.
 */

import { StepFunctionUseCase } from "@megawin/app-core/use-cases";
import { EntryStatus } from "@megawin/game-core/entities";
import { PrizeTier } from "@megawin/game-power655/entities";
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

/**
 * Patch split bonus vào entries thắng giải cố định.
 * Chỉ chạy khi kỳ quay là split cycle (tổng JP vượt ngưỡng).
 */
export class ApplySplitBonusesUseCase extends StepFunctionUseCase<
  ApplySplitBonusesInput,
  ApplySplitBonusesResult
> {
  private readonly entryRepo = new EntryRepository();

  /** @inheritdoc */
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
