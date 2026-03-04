/**
 * Lambda: finalize-settle (Max 3D)
 *
 * Bước cuối của Max3D Settle Step Function.
 * Chuyển draw status: settling → settled.
 *
 * Max 3D không có Jackpot → không cần ghi jackpot snapshot / update cycle.
 *
 * CRASH-SAFE: transitionStatus atomic, idempotent.
 *
 * @input  { drawId }
 * @output FinalizeSettleResult
 */

import {
  FinalizeSettleUseCase,
  type FinalizeSettleInput,
} from "@megawin/game-max3d-application/use-cases/settle";

const useCase = new FinalizeSettleUseCase();

export async function handler(event: FinalizeSettleInput) {
  return useCase.run(event);
}
