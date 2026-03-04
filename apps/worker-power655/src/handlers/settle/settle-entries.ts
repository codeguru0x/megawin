/**
 * Lambda: settle-entries (Power 6/55)
 *
 * Step 3 (loop) của Power655 Settle Step Function.
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
} from "@megawin/game-power655-application/use-cases/settle";

const useCase = new SettleEntriesBatchUseCase();

export async function handler(event: SettleEntriesBatchInput) {
  return useCase.run(event);
}
