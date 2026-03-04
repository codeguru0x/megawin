/**
 * Lambda: finalize-settle (Keno)
 *
 * Step 6 của Keno Settle Step Function.
 * Chuyển draw status: settling → settled. Keno không có Jackpot.
 *
 * CRASH-SAFE: transitionStatus atomic, idempotent.
 *
 * @input  FinalizeSettleInput
 * @output FinalizeSettleResult
 */

import {
  FinalizeSettleUseCase,
  type FinalizeSettleInput,
} from "@megawin/game-keno-application/use-cases/settle";

const useCase = new FinalizeSettleUseCase();

export async function handler(event: FinalizeSettleInput) {
  return useCase.run(event);
}
