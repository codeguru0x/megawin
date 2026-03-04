/**
 * Lambda: void-entries (Keno)
 *
 * Step 2 (loop) của Void Draw Step Function.
 * Void 1 batch entries + update ticket voidSummary.
 *
 * @input  VoidEntriesBatchInput
 * @output VoidEntriesBatchResult
 */

import {
  VoidEntriesBatchUseCase,
  type VoidEntriesBatchInput,
} from "@megawin/game-keno-application/use-cases/void";

const useCase = new VoidEntriesBatchUseCase();

export async function handler(event: VoidEntriesBatchInput) {
  return useCase.run(event);
}
