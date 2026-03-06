/**
 * Lambda: finalize-settle (Bingo 18)
 *
 * Step 6 (cuối) của Bingo 18 Settle Step Function.
 * Chuyển draw status: settling → settled. Bingo 18 không có Jackpot.
 *
 * CRASH-SAFE: transitionStatus atomic, idempotent.
 *
 * @input  SettleContextWithFinancials ($settleCtx, financials bắt buộc)
 * @output FinalizeSettleResult
 */

import { FinalizeSettleUseCase } from "@megawin/game-bingo18-application/use-cases/settle";
import type { SettleContextWithFinancials } from "@megawin/game-bingo18-application/use-cases/settle";

const useCase = new FinalizeSettleUseCase();

export async function handler(event: SettleContextWithFinancials) {
  return useCase.run(event);
}
