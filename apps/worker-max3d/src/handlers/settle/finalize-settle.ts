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

import { FinalizeSettleUseCase } from "@megawin/game-max3d-application/use-cases/settle";

interface Input {
  drawId: string;
}

const useCase = new FinalizeSettleUseCase();

export async function handler(event: Input) {
  const result = await useCase.run({
    drawId: event.drawId,
  });
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}
