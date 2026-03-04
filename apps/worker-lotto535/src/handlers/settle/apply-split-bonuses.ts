/**
 * Lambda: apply-split-bonuses (Lotto 5/35)
 *
 * Patch bonusPerWinner từ Jackpot split vào entry payout.
 * Chỉ chạy khi isSplitCycle = true.
 *
 * @input  { drawId, isSplitCycle, splitDetails }
 * @output ApplySplitBonusesResult
 */

import {
  ApplySplitBonusesUseCase,
  type ApplySplitBonusesInput,
} from "@megawin/game-lotto535-application/use-cases/settle";

const useCase = new ApplySplitBonusesUseCase();

export async function handler(event: ApplySplitBonusesInput) {
  return useCase.run(event);
}
