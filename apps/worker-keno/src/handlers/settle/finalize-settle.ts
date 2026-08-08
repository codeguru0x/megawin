/**
 * Lambda: finalize-settle (Keno)
 *
 * Chuyển draw status: settling → settled. Keno không có Jackpot.
 *
 * CRASH-SAFE: transitionStatus atomic, idempotent.
 *
 * @input  SettleContext ($settleCtx, đã có financials)
 * @output FinalizeSettleResult
 */

import type { SettleContext } from "@megawin/game-keno-application/use-cases/settle";
import { FinalizeSettleUseCase } from "@megawin/game-keno-application/use-cases/settle";

const useCase = new FinalizeSettleUseCase();

export async function handler(event: SettleContext) {
  return useCase.run(event);
}
