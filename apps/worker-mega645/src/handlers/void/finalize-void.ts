/**
 * Lambda: void-finalize (Mega 6/45)
 *
 * Step cuối của Void Draw Step Function.
 * Aggregate tổng kết void từ DB, ghi voidSummary lên draw document.
 *
 * IDEMPOTENT: aggregate + overwrite.
 *
 * @input  VoidContext
 * @output FinalizeVoidResult
 */

import { FinalizeVoidUseCase, type VoidContext } from "@megawin/game-mega645-application/use-cases/void";

const useCase = new FinalizeVoidUseCase();

export async function handler(event: VoidContext) {
  return useCase.run(event);
}
