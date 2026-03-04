/**
 * Lambda: void-finalize (Mega 6/45)
 *
 * Step 4 (cuối) của Void Draw Step Function.
 * Aggregate tổng kết void từ DB, ghi voidSummary lên draw document.
 *
 * IDEMPOTENT: aggregate + overwrite.
 *
 * @input  { drawId }
 * @output FinalizeVoidResult
 */

import {
  FinalizeVoidUseCase,
  type FinalizeVoidInput,
} from "@megawin/game-mega645-application/use-cases/void";

const useCase = new FinalizeVoidUseCase();

export async function handler(event: FinalizeVoidInput) {
  return useCase.run(event);
}
