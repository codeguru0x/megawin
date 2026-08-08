/**
 * Lambda: settle-entries (Power 6/55)
 *
 * Step 2 (loop) của Power655 Settle Step Function.
 * Xử lý 1 batch entries: expand boards → match lines → payout → settle.
 *
 * CRASH-SAFE: entries đã settled tự filter ra bởi status.
 *
 * @input  SettleContext ($settleCtx)
 * @output SettleEntriesBatchResult
 */

import type { SettleContext } from "@megawin/game-power655-application/use-cases/settle";
import { SettleEntriesBatchUseCase } from "@megawin/game-power655-application/use-cases/settle";

const useCase = new SettleEntriesBatchUseCase();

export async function handler(event: SettleContext) {
  return useCase.run(event);
}
