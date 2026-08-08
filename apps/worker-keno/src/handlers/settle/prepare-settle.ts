/**
 * Lambda: prepare-settle (Keno)
 *
 * Step 1 của Keno Settle Step Function.
 * Load context: draw, game config, entry counts. Idempotent.
 *
 * @input  PrepareSettleInput
 * @output SettleContext
 */

import { PrepareSettleUseCase, type PrepareSettleInput } from "@megawin/game-keno-application/use-cases/settle";

const useCase = new PrepareSettleUseCase();

export async function handler(event: PrepareSettleInput) {
  return useCase.run(event);
}
