/**
 * Lambda: void-finalize (Bingo 18)
 *
 * Step 4 (cuối) của Void Draw Step Function.
 * Aggregate void summary, ghi lên draw document.
 *
 * IDEMPOTENT: aggregate + overwrite.
 *
 * @input  VoidContext ($voidCtx)
 * @output FinalizeVoidResult
 */

import { FinalizeVoidUseCase } from "@megawin/game-bingo18-application/use-cases/void";
import type { VoidContext } from "@megawin/game-bingo18-application/use-cases/void";

const useCase = new FinalizeVoidUseCase();

export async function handler(event: VoidContext) {
  return useCase.run(event);
}
