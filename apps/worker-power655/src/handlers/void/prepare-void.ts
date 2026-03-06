/**
 * Lambda: void-prepare (Power 6/55)
 *
 * Step 1 của Void Draw Step Function.
 * Validate draw có thể void, load context.
 *
 * @input  { drawId }
 * @output VoidContext
 */

import { PrepareVoidUseCase } from "@megawin/game-power655-application/use-cases/void";
import type { PrepareVoidInput } from "@megawin/game-power655-application/use-cases/void";

const useCase = new PrepareVoidUseCase();

export async function handler(event: PrepareVoidInput) {
  return useCase.run(event);
}
