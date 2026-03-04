/**
 * Lambda: void-entries (Mega 6/45)
 *
 * Step 2 (loop) của Void Draw Step Function.
 * Void 1 batch entries + update ticket voidSummary.
 *
 * CRASH-SAFE: entries đã void tự filter ra.
 *
 * @input  { drawId, reason, voidedBy?, batchSize? }
 * @output VoidEntriesBatchResult
 */

import {
  VoidEntriesBatchUseCase,
  type VoidEntriesBatchInput,
} from "@megawin/game-mega645-application/use-cases/void";

const useCase = new VoidEntriesBatchUseCase();

export async function handler(event: VoidEntriesBatchInput) {
  return useCase.run(event);
}
