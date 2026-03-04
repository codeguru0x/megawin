/**
 * Lambda: settle-entries (Lotto 5/35)
 *
 * Step 3 (loop) của Lotto535 Settle Step Function.
 * Xử lý 1 batch entries: expand boards → match lines → payout → settle.
 *
 * CRASH-SAFE: entries đã settled tự filter ra bởi status.
 *
 * @input  { drawId, result, prizeAmounts, isSplitCycle, batchSize }
 * @output SettleEntriesBatchResult
 */

import {
  SettleEntriesBatchUseCase,
  type SettleEntriesBatchInput,
} from "@megawin/game-lotto535-application/use-cases/settle";

const useCase = new SettleEntriesBatchUseCase();

export async function handler(event: SettleEntriesBatchInput) {
  return useCase.run(event);
}
