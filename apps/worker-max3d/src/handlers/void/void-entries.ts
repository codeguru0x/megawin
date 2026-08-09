/**
 * Lambda: void-entries (Max 3D)
 *
 * Step 2 (loop) của Void Draw Step Function.
 * Void 1 batch entries + update ticket voidSummary.
 *
 * CRASH-SAFE: entries đã void tự filter ra.
 *
 * @input  VoidContext ($voidCtx)
 * @output VoidEntriesBatchResult
 */

import type { VoidContext } from "@megawin/game-max3d-application/use-cases/void";
import { VoidEntriesBatchUseCase } from "@megawin/game-max3d-application/use-cases/void";

const useCase = new VoidEntriesBatchUseCase();

export async function handler(event: VoidContext) {
  return useCase.run(event);
}
