/**
 * Lambda: void-prepare (Keno)
 *
 * Step 1 của Void Draw Step Function.
 * Validate draw có thể void, transition → void, load context.
 *
 * @input  PrepareVoidInput
 * @output PrepareVoidResult
 */

import {
  PrepareVoidUseCase,
  type PrepareVoidInput,
} from "@megawin/game-keno-application/use-cases/void";

const useCase = new PrepareVoidUseCase();

export async function handler(event: PrepareVoidInput) {
  return useCase.run(event);
}
