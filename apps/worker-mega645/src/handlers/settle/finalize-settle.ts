/**
 * Lambda: finalize-settle (Mega 6/45)
 *
 * Step cuối của Mega645 Settle Step Function.
 * Chuyển draw status: settling → settled. Ghi jackpot snapshot + update cycle.
 *
 * CRASH-SAFE: transitionStatus atomic, idempotent.
 *
 * @input  SettleContextWithFinancials
 * @output FinalizeSettleResult
 */

import {
  FinalizeSettleUseCase,
  type SettleContextWithFinancials,
} from "@megawin/game-mega645-application/use-cases/settle";

const useCase = new FinalizeSettleUseCase();

export async function handler(event: SettleContextWithFinancials) {
  return useCase.run(event);
}
