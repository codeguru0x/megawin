/**
 * Lambda: finalize-settle (Lotto 5/35)
 *
 * Step 7 (cuối) của Lotto535 Settle Step Function.
 * Chuyển draw status: settling → settled. Ghi jackpot snapshot + update cycle.
 *
 * CRASH-SAFE: transitionStatus atomic, idempotent.
 *
 * @input  SettleContextWithFinancials ($settleCtx, financials bắt buộc)
 * @output FinalizeSettleResult
 */

import { FinalizeSettleUseCase } from "@megawin/game-lotto535-application/use-cases/settle";
import type { SettleContextWithFinancials } from "@megawin/game-lotto535-application/use-cases/settle";

const useCase = new FinalizeSettleUseCase();

export async function handler(event: SettleContextWithFinancials) {
  return useCase.run(event);
}
