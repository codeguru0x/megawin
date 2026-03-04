/**
 * Lambda: settle-entries (Keno)
 *
 * Step 2 (loop) của Keno Settle Step Function.
 * Match boards + side bets → payout → settle.
 *
 * CRASH-SAFE: entries đã settled tự filter ra bởi status.
 *
 * @input  SettleEntriesBatchInput
 * @output SettleEntriesBatchResult
 */

import {
  SettleEntriesBatchUseCase,
  type SettleEntriesBatchInput,
} from "@megawin/game-keno-application/use-cases/settle";

const useCase = new SettleEntriesBatchUseCase();

export async function handler(event: SettleEntriesBatchInput) {
  return useCase.run(event);
}
