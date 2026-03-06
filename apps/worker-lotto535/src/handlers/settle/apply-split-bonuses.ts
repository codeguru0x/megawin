/**
 * Lambda: apply-split-bonuses (Lotto 5/35)
 *
 * Patch bonusPerWinner từ Jackpot split vào entry payout.
 * Chỉ chạy khi isSplitCycle = true VÀ financials.splitDetails tồn tại.
 *
 * @input  SettleContext ($settleCtx, đã có financials)
 * @output ApplySplitBonusesResult
 */

import { ApplySplitBonusesUseCase } from "@megawin/game-lotto535-application/use-cases/settle";
import type { SettleContext } from "@megawin/game-lotto535-application/use-cases/settle";

const useCase = new ApplySplitBonusesUseCase();

export async function handler(event: SettleContext) {
  return useCase.run(event);
}
