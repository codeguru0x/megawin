/**
 * Lambda: finalize-settle (Bingo 18)
 *
 * Step 6 (cuối) của Bingo 18 Settle Step Function.
 * Chuyển draw status: settling → settled. Bingo 18 không có Jackpot.
 *
 * CRASH-SAFE: transitionStatus atomic, idempotent.
 *
 * @input  { drawId }
 * @output FinalizeSettleResult
 */

import {
  FinalizeSettleUseCase,
  type FinalizeSettleInput,
} from "@megawin/game-bingo18-application/use-cases/settle";

const useCase = new FinalizeSettleUseCase();

export async function handler(event: FinalizeSettleInput) {
  return useCase.run(event);
}
