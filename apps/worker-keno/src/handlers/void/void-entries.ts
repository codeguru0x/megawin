/**
 * Lambda: void-entries (Keno)
 *
 * Step 2 (loop) của Void Draw Step Function.
 * Void 1 batch entries + tính refund amount.
 *
 * CRASH-SAFE: entries đã void tự filter ra.
 *
 * @input  VoidContext ($voidCtx)
 * @output VoidEntriesBatchResult
 */

import { VoidEntriesBatchUseCase } from "@megawin/game-keno-application/use-cases/void";
import type { VoidContext } from "@megawin/game-keno-application/use-cases/void";

const useCase = new VoidEntriesBatchUseCase();

export async function handler(event: VoidContext) {
  return useCase.run(event);
}
