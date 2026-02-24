/**
 * Lambda: finalize-settle (Lotto 5/35)
 *
 * Step 6 (cuối) của Lotto535 Settle Step Function.
 * Chuyển draw status: settling → settled. Propagate jackpot chain.
 *
 * CRASH-SAFE: transitionStatus atomic, idempotent.
 *
 * @input  { drawId, closingJackpot, nextJackpotOpening }
 * @output FinalizeSettleResult
 */

import { FinalizeSettleUseCase } from "@megawin/game-lotto535-application/use-cases/settle";

interface Input {
  drawId: string;
  closingJackpot: number;
  nextJackpotOpening: number;
}

const useCase = new FinalizeSettleUseCase();

export async function handler(event: Input) {
  const result = await useCase.run({
    drawId: event.drawId,
    closingJackpot: event.closingJackpot,
    nextJackpotOpening: event.nextJackpotOpening,
  });
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}
