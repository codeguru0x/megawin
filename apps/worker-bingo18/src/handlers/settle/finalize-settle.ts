/**
 * Lambda: finalize-settle (Bingo 18)
 *
 * Step 6 (cuối) của Bingo 18 Settle Step Function.
 * Chuyển draw status: settling → settled. Bingo 18 không có Jackpot.
 *
 * CRASH-SAFE: transitionStatus atomic, idempotent.
 *
 * @input  { drawId }
 * @output FinalizeSettleResult
 */

import { FinalizeSettleUseCase } from "@megawin/game-bingo18-application/use-cases/settle";

interface Input {
  drawId: string;
}

const useCase = new FinalizeSettleUseCase();

export async function handler(event: Input) {
  const result = await useCase.run({ drawId: event.drawId });
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}
