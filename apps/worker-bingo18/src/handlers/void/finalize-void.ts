/**
 * Lambda: void-finalize (Bingo 18)
 *
 * Step 4 (cuối) của Void Draw Step Function.
 * Aggregate void summary, ghi lên draw document.
 *
 * @input  { drawId }
 * @output FinalizeVoidResult
 */

import {
  FinalizeVoidUseCase,
  type FinalizeVoidInput,
} from "@megawin/game-bingo18-application/use-cases/void";

const useCase = new FinalizeVoidUseCase();

export async function handler(event: FinalizeVoidInput) {
  return useCase.run(event);
}
