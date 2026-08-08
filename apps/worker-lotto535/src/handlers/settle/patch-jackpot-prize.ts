/**
 * Lambda: patch-jackpot-prize (Lotto 5/35)
 *
 * Patch tiền thưởng Jackpot vào entries + lines cho JP winners.
 * Chỉ chạy khi financials.hasJackpotWinner = true (route bởi Step Function).
 *
 * @input  SettleContext ($settleCtx, đã có financials)
 * @output PatchJackpotPrizeResult { drawId, entriesPatched }
 */

import type { SettleContext } from "@megawin/game-lotto535-application/use-cases/settle";
import { PatchJackpotPrizeUseCase } from "@megawin/game-lotto535-application/use-cases/settle";

const useCase = new PatchJackpotPrizeUseCase();

export async function handler(event: SettleContext) {
  return useCase.run(event);
}
