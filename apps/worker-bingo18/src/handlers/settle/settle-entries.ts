/**
 * Lambda: settle-entries (Bingo 18)
 *
 * Step 3 (loop) của Bingo 18 Settle Step Function.
 * Match boards + side bets → payout → settle.
 *
 * CRASH-SAFE: entries đã settled tự filter ra bởi status.
 *
 * @input  { drawId, result, config, batchSize }
 * @output SettleEntriesBatchResult
 */

import {
  SettleEntriesBatchUseCase,
  type SettleEntriesBatchInput,
} from "@megawin/game-bingo18-application/use-cases/settle";

const useCase = new SettleEntriesBatchUseCase();

export async function handler(event: SettleEntriesBatchInput) {
  return useCase.run(event);
}
