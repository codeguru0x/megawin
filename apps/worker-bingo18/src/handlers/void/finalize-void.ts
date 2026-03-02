/**
 * Lambda: void-finalize (Bingo 18)
 *
 * Step 4 (cuối) của Void Draw Step Function.
 * Aggregate void summary, ghi lên draw document.
 *
 * @input  { drawId }
 * @output FinalizeVoidResult
 */

import { FinalizeVoidUseCase } from "@megawin/game-bingo18-application/use-cases/void";

interface Input {
  drawId: string;
}

const useCase = new FinalizeVoidUseCase();

export async function handler(event: Input) {
  const result = await useCase.run({ drawId: event.drawId });
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}
