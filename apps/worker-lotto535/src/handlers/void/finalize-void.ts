/**
 * Lambda: void-finalize (Lotto 5/35)
 *
 * Step 5 (cuối) của Void Draw Step Function.
 * Aggregate tổng kết void từ DB, ghi voidSummary lên draw document.
 *
 * IDEMPOTENT: aggregate + overwrite.
 *
 * @input  VoidContext ($voidCtx)
 * @output FinalizeVoidResult
 */

import { FinalizeVoidUseCase } from "@megawin/game-lotto535-application/use-cases/void";
import type { VoidContext } from "@megawin/game-lotto535-application/use-cases/void";

const useCase = new FinalizeVoidUseCase();

export async function handler(event: VoidContext) {
  return useCase.run(event);
}
