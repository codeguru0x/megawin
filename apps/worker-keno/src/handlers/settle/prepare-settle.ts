/**
 * Lambda: prepare-settle (Keno)
 *
 * Step 1 của Keno Settle Step Function.
 * Load context: draw, game config, entry counts. Idempotent.
 *
 * @input  { drawId: string }
 * @output PrepareSettleResult
 */

import { PrepareSettleUseCase } from "@megawin/game-keno-application/use-cases/settle";

interface Input {
  drawId: string;
}

const useCase = new PrepareSettleUseCase();

export async function handler(event: Input) {
  const result = await useCase.run({ drawId: event.drawId });
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}
