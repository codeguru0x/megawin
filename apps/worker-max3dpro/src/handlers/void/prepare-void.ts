/**
 * Lambda: void-prepare (Max 3D Pro)
 *
 * Step 1 của Void Draw Step Function.
 * Validate draw có thể void, transition status → void, load context.
 *
 * @input  { drawId, reason, voidedBy? }
 * @output PrepareVoidResult
 */

import { PrepareVoidUseCase } from "@megawin/game-max3dpro-application/use-cases/void";

interface Input {
  drawId: string;
  reason: string;
  voidedBy?: string;
}

const useCase = new PrepareVoidUseCase();

export async function handler(event: Input) {
  const result = await useCase.run({
    drawId: event.drawId,
    reason: event.reason,
    voidedBy: event.voidedBy,
  });
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}
