/**
 * Lambda: apply-split-bonuses (Lotto 5/35)
 *
 * Patch split bonus Jackpot vào entries cho người trúng tier1-tier5.
 * Chỉ chạy khi isSplitCycle = true VÀ financials.splitDetails tồn tại
 * VÀ hasJackpotWinner = false (route bởi Step Function).
 *
 * @input  SettleContext ($settleCtx, đã có financials + splitDetails)
 * @output ApplySplitBonusesResult { drawId, entriesPatched }
 */

import type { SettleContext } from "@megawin/game-lotto535-application/use-cases/settle";
import { ApplySplitBonusesUseCase } from "@megawin/game-lotto535-application/use-cases/settle";

const useCase = new ApplySplitBonusesUseCase();

export async function handler(event: SettleContext) {
  return useCase.run(event);
}
