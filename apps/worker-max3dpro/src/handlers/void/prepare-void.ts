/**
 * Lambda: void-prepare (Max 3D Pro)
 *
 * Step 1 của Void Draw Step Function.
 * Validate draw có thể void, load context.
 */

import { PrepareVoidUseCase, type PrepareVoidInput } from "@megawin/game-max3dpro-application/use-cases/void";

const useCase = new PrepareVoidUseCase();

export async function handler(event: PrepareVoidInput) {
  return useCase.run(event);
}
