/**
 * Lambda: void-entries (Power 6/55)
 *
 * Step 2 (loop) của Void Draw Step Function.
 * Void 1 batch entries + update ticket voidSummary.
 *
 * CRASH-SAFE: entries đã void tự filter ra.
 *
 * @input  VoidContext ($voidCtx)
 * @output VoidEntriesBatchResult
 */

import type { VoidContext } from "@megawin/game-power655-application/use-cases/void";
import { VoidEntriesBatchUseCase } from "@megawin/game-power655-application/use-cases/void";

const useCase = new VoidEntriesBatchUseCase();

export async function handler(event: VoidContext) {
  return useCase.run(event);
}
