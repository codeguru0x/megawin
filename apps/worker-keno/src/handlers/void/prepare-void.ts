/**
 * Lambda: void-prepare (Keno)
 *
 * Step 1 của Void Draw Step Function.
 * Validate draw có thể void, load context.
 *
 * @input  PrepareVoidInput
 * @output VoidContext
 */

import { PrepareVoidUseCase, type PrepareVoidInput } from "@megawin/game-keno-application/use-cases/void";

const useCase = new PrepareVoidUseCase();

export async function handler(event: PrepareVoidInput) {
  return useCase.run(event);
}
