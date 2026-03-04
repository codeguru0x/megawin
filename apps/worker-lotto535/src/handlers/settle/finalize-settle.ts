/**
 * Lambda: finalize-settle (Lotto 5/35)
 *
 * Step 6 (cuối) của Lotto535 Settle Step Function.
 * Chuyển draw status: settling → settled. Ghi jackpot snapshot + update cycle.
 *
 * CRASH-SAFE: transitionStatus atomic, idempotent.
 *
 * @input  { drawId, closingJackpot, nextJackpotOpening, hasJackpotWinner, isSplitCycle, splitDetails }
 * @output FinalizeSettleResult
 */

import {
  FinalizeSettleUseCase,
  type FinalizeSettleInput,
} from "@megawin/game-lotto535-application/use-cases/settle";

const useCase = new FinalizeSettleUseCase();

export async function handler(event: FinalizeSettleInput) {
  return useCase.run(event);
}
