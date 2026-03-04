/**
 * Lambda: apply-split-bonuses (Power 6/55)
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
} from "@megawin/game-power655-application/use-cases/settle";

const useCase = new ApplySplitBonusesUseCase();

export async function handler(event: ApplySplitBonusesInput) {
  return useCase.run(event);
}
