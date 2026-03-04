/**
 * Lambda: void-prepare (Max 3D)
 *
 * Step 1 của Void Draw Step Function.
 * Validate draw có thể void, transition status → void, load context.
 *
 * @input  { drawId, reason, voidedBy? }
 * @output PrepareVoidResult
 */

import {
  PrepareVoidUseCase,
  type PrepareVoidInput,
} from "@megawin/game-max3d-application/use-cases/void";

const useCase = new PrepareVoidUseCase();

export async function handler(event: PrepareVoidInput) {
  return useCase.run(event);
}
