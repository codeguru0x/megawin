/**
 * Lambda: finalize-settle (Power 6/55)
 *
 * Step 7 (cuối) của Power655 Settle Step Function.
 * Chuyển draw status: settling → settled. Ghi jackpot snapshot + update cycle.
 *
 * CRASH-SAFE: transitionStatus atomic, idempotent.
 *
 * @input  SettleContextWithFinancials ($settleCtx, financials bắt buộc)
 * @output FinalizeSettleResult
 */

import type { SettleContextWithFinancials } from "@megawin/game-power655-application/use-cases/settle";
import { FinalizeSettleUseCase } from "@megawin/game-power655-application/use-cases/settle";

const useCase = new FinalizeSettleUseCase();

export async function handler(event: SettleContextWithFinancials) {
  return useCase.run(event);
}
