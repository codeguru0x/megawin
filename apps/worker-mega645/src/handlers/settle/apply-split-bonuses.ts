/**
 * Lambda: apply-split-bonuses (Mega 6/45)
 *
 * Patch bonusPerWinner từ Jackpot split vào entry payout.
 * Chỉ chạy khi isSplitCycle = true.
 *
 * @input  SettleContext (có financials.splitDetails)
 * @output ApplySplitBonusesResult
 */

import {
  ApplySplitBonusesUseCase,
  type SettleContext,
} from "@megawin/game-mega645-application/use-cases/settle";

const useCase = new ApplySplitBonusesUseCase();

export async function handler(event: SettleContext) {
  return useCase.run(event);
}
