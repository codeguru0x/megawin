/**
 * Lambda: void-finalize (Keno)
 *
 * Step 4 (cuối) của Void Draw Step Function.
 * Aggregate void summary, ghi lên draw document.
 *
 * @input  FinalizeVoidInput
 * @output FinalizeVoidResult
 */

import {
  FinalizeVoidUseCase,
  type FinalizeVoidInput,
} from "@megawin/game-keno-application/use-cases/void";

const useCase = new FinalizeVoidUseCase();

export async function handler(event: FinalizeVoidInput) {
  return useCase.run(event);
}
