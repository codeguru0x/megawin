/**
 * Lambda: finalize-settle (Max 3D Pro)
 *
 * Bước cuối của Max3dpro Settle Step Function.
 * Chuyển draw status: settling → settled.
 *
 * Max 3D Pro không có Jackpot → không cần ghi jackpot snapshot / update cycle.
 *
 * CRASH-SAFE: transitionStatus atomic, idempotent.
 *
 * @input  { drawId }
 * @output FinalizeSettleResult
 */

import {
  FinalizeSettleUseCase,
  type FinalizeSettleInput,
} from "@megawin/game-max3dpro-application/use-cases/settle";

const useCase = new FinalizeSettleUseCase();

export async function handler(event: FinalizeSettleInput) {
  return useCase.run(event);
}
