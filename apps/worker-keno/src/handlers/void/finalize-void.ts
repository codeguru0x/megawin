/**
 * Lambda: void-finalize (Keno)
 *
 * Step cuối của Void Draw Step Function.
 * Aggregate void summary, ghi lên draw document.
 *
 * @input  VoidContext ($voidCtx)
 * @output FinalizeVoidResult
 */

import { FinalizeVoidUseCase } from "@megawin/game-keno-application/use-cases/void";
import type { VoidContext } from "@megawin/game-keno-application/use-cases/void";

const useCase = new FinalizeVoidUseCase();

export async function handler(event: VoidContext) {
  return useCase.run(event);
}
