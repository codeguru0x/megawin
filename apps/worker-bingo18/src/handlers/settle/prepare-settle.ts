/**
 * Lambda: prepare-settle (Bingo 18)
 *
 * Step 1 của Bingo 18 Settle Step Function.
 * Load context: draw, game config, entry counts. Idempotent.
 *
 * @input  { drawId: string }
 * @output SettleContext
 */

import { type PrepareSettleInput, PrepareSettleUseCase } from "@megawin/game-bingo18-application/use-cases/settle";

const useCase = new PrepareSettleUseCase();

export async function handler(event: PrepareSettleInput) {
  return useCase.run(event);
}
