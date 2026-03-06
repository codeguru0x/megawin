/**
 * Lambda: settle-entries (Lotto 5/35)
 *
 * Step 2 (loop) của Lotto535 Settle Step Function.
 * Xử lý 1 batch entries: expand boards → match lines → payout → settle.
 *
 * CRASH-SAFE: entries đã settled tự filter ra bởi status.
 *
 * @input  SettleContext ($settleCtx)
 * @output SettleEntriesBatchResult
 */

import { SettleEntriesBatchUseCase } from "@megawin/game-lotto535-application/use-cases/settle";
import type { SettleContext } from "@megawin/game-lotto535-application/use-cases/settle";

const useCase = new SettleEntriesBatchUseCase();

export async function handler(event: SettleContext) {
  return useCase.run(event);
}
