/**
 * Lambda: void-finalize (Max 3D)
 *
 * Step 4 (cuối) của Void Draw Step Function.
 * Aggregate tổng kết void từ DB, ghi voidSummary lên draw document.
 *
 * IDEMPOTENT: aggregate + overwrite.
 *
 * @input  VoidContext ($voidCtx)
 * @output FinalizeVoidResult
 */

import type { VoidContext } from "@megawin/game-max3d-application/use-cases/void";
import { FinalizeVoidUseCase } from "@megawin/game-max3d-application/use-cases/void";

const useCase = new FinalizeVoidUseCase();

export async function handler(event: VoidContext) {
  return useCase.run(event);
}
