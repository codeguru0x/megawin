/**
 * Lambda: void-prepare (Bingo 18)
 *
 * Step 1 của Void Draw Step Function.
 * Validate draw có thể void, load context.
 *
 * @input  { drawId }
 * @output VoidContext
 */

import type { PrepareVoidInput } from "@megawin/game-bingo18-application/use-cases/void";
import { PrepareVoidUseCase } from "@megawin/game-bingo18-application/use-cases/void";

const useCase = new PrepareVoidUseCase();

export async function handler(event: PrepareVoidInput) {
  return useCase.run(event);
}
