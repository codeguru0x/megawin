/**
 * Lambda: void-finalize (Lotto 5/35)
 *
 * Step 4 (cuối) của Void Draw Step Function.
 * Aggregate tổng kết void từ DB, ghi voidSummary lên draw document.
 *
 * IDEMPOTENT: aggregate + overwrite.
 *
 * @input  { drawId }
 * @output FinalizeVoidResult
 */

import { FinalizeVoidUseCase } from "@megawin/game-lotto535-application/use-cases/void";

interface Input {
  drawId: string;
}

const useCase = new FinalizeVoidUseCase();

export async function handler(event: Input) {
  const result = await useCase.run({ drawId: event.drawId });
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}
