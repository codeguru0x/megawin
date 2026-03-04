/**
 * Lambda: void-entries (Bingo 18)
 *
 * Step 2 (loop) của Void Draw Step Function.
 * Void 1 batch entries + update ticket voidSummary.
 *
 * @input  { drawId, reason, voidedBy?, batchSize? }
 * @output VoidEntriesBatchResult
 */

import {
  VoidEntriesBatchUseCase,
  type VoidEntriesBatchInput,
} from "@megawin/game-bingo18-application/use-cases/void";

const useCase = new VoidEntriesBatchUseCase();

export async function handler(event: VoidEntriesBatchInput) {
  return useCase.run(event);
}
