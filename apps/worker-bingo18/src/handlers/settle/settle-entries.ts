/**
 * Lambda: settle-entries (Bingo 18)
 *
 * Step 2 (loop) của Bingo 18 Settle Step Function.
 * Match boards + side bets → payout → settle.
 *
 * CRASH-SAFE: entries đã settled tự filter ra bởi status.
 *
 * @input  SettleContext ($settleCtx)
 * @output SettleEntriesBatchResult
 */

import { SettleEntriesBatchUseCase } from "@megawin/game-bingo18-application/use-cases/settle";
import type { SettleContext } from "@megawin/game-bingo18-application/use-cases/settle";

const useCase = new SettleEntriesBatchUseCase();

export async function handler(event: SettleContext) {
  return useCase.run(event);
}
