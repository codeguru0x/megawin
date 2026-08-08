/**
 * Lambda: void-finalize (Power 6/55)
 *
 * Step 5 (cuối) của Void Draw Step Function.
 * Aggregate tổng kết void từ DB, ghi voidSummary lên draw document.
 *
 * IDEMPOTENT: aggregate + overwrite.
 *
 * @input  VoidContext ($voidCtx)
 * @output FinalizeVoidResult
 */

import type { VoidContext } from "@megawin/game-power655-application/use-cases/void";
import { FinalizeVoidUseCase } from "@megawin/game-power655-application/use-cases/void";

const useCase = new FinalizeVoidUseCase();

export async function handler(event: VoidContext) {
  return useCase.run(event);
}
