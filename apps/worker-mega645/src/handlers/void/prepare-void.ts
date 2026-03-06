/**
 * Lambda: void-prepare (Mega 6/45)
 *
 * Step 1 của Void Draw Step Function.
 * Validate draw có thể void, load context.
 *
 * @input  { drawId }
 * @output VoidContext
 */

import {
  PrepareVoidUseCase,
  type PrepareVoidInput,
} from "@megawin/game-mega645-application/use-cases/void";

const useCase = new PrepareVoidUseCase();

export async function handler(event: PrepareVoidInput) {
  return useCase.run(event);
}
