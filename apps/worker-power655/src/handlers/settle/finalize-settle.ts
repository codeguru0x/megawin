/**
 * Lambda: finalize-settle (Power 6/55)
 *
 * Step 6 (cuối) của Power655 Settle Step Function.
 * Chuyển draw status: settling → settled. Ghi jackpot snapshot + update cycle.
 *
 * CRASH-SAFE: transitionStatus atomic, idempotent.
 *
 * @input  FinalizeSettleInput fields
 * @output FinalizeSettleResult
 */

import {
  FinalizeSettleUseCase,
  type FinalizeSettleInput,
} from "@megawin/game-power655-application/use-cases/settle";

const useCase = new FinalizeSettleUseCase();

export async function handler(event: FinalizeSettleInput) {
  return useCase.run(event);
}
