/**
 * Lambda: finalize-settle (Mega 6/45)
 *
 * Step 6 (cuối) của Mega645 Settle Step Function.
 * Chuyển draw status: settling → settled. Ghi jackpot snapshot + update cycle.
 *
 * Single jackpot (not dual JP1/JP2 like Power 6/55).
 *
 * CRASH-SAFE: transitionStatus atomic, idempotent.
 *
 * @input  FinalizeSettleInput fields
 * @output FinalizeSettleResult
 */

import {
  FinalizeSettleUseCase,
  type FinalizeSettleInput,
} from "@megawin/game-mega645-application/use-cases/settle";

const useCase = new FinalizeSettleUseCase();

export async function handler(event: FinalizeSettleInput) {
  return useCase.run(event);
}
