/**
 * Lambda: void-entries (Mega 6/45)
 *
 * Step 2 (loop) của Void Draw Step Function.
 * Void batch entries.
 *
 * CRASH-SAFE: entries đã void tự filter ra.
 *
 * @input  VoidContext
 * @output VoidEntriesBatchResult
 */

import {
  VoidEntriesBatchUseCase,
  type VoidContext,
} from "@megawin/game-mega645-application/use-cases/void";

const useCase = new VoidEntriesBatchUseCase();

export async function handler(event: VoidContext) {
  return useCase.run(event);
}
