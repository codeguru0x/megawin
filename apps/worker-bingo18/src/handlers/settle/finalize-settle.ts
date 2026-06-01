/**
 * Lambda: finalize-settle (Bingo 18)
 *
 * Step 6 (cuối) của Bingo 18 Settle Step Function.
 * Chuyển draw status: settling → settled. Bingo 18 không có Jackpot.
 *
 * CRASH-SAFE: transitionStatus atomic, idempotent.
 *
 * @input  SettleContext ($settleCtx — financials đã merge từ CalculateFinancials,
 *                        body không đọc financials)
 * @output FinalizeSettleResult
 */

import { FinalizeSettleUseCase } from "@megawin/game-bingo18-application/use-cases/settle";
import type { SettleContext } from "@megawin/game-bingo18-application/use-cases/settle";

const useCase = new FinalizeSettleUseCase();

export async function handler(event: SettleContext) {
  return useCase.run(event);
}
