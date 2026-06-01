/**
 * Lambda: finalize-settle (Max 3D)
 *
 * Step 6 của Max3D Settle Step Function.
 * Chuyển draw status: settling → settled.
 *
 * Max 3D không có Jackpot → không cần ghi jackpot snapshot / update cycle.
 *
 * CRASH-SAFE: transitionStatus atomic, idempotent.
 *
 * @input  SettleContext ($settleCtx — financials đã merge từ CalculateFinancials,
 *                        body không đọc financials)
 * @output FinalizeSettleResult
 */

import { FinalizeSettleUseCase } from "@megawin/game-max3d-application/use-cases/settle";
import type { SettleContext } from "@megawin/game-max3d-application/use-cases/settle";

const useCase = new FinalizeSettleUseCase();

export async function handler(event: SettleContext) {
  return useCase.run(event);
}
