/**
 * Lambda: settle-entries (Mega 6/45)
 *
 * Step 2 (loop) của Mega645 Settle Step Function.
 * Xử lý entries: expand boards → match lines → payout → settle.
 *
 * CRASH-SAFE: entries đã settled tự filter ra bởi status.
 *
 * @input  SettleContext
 * @output SettleEntriesBatchResult
 */

import { SettleEntriesBatchUseCase, type SettleContext } from "@megawin/game-mega645-application/use-cases/settle";

const useCase = new SettleEntriesBatchUseCase();

export async function handler(event: SettleContext) {
  return useCase.run(event);
}
