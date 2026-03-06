/**
 * Lambda: sync-ticket-summaries (Max 3D)
 *
 * Step 3 (loop) của Max3D Settle Step Function.
 * Recompute ticket progress/settlement/voidSummary từ entries.
 *
 * @input  SettleContext ($settleCtx)
 * @output SyncTicketSummariesResult
 */

import { SyncTicketSummariesUseCase } from "@megawin/game-max3d-application/use-cases/settle";
import type { SettleContext } from "@megawin/game-max3d-application/use-cases/settle";

const useCase = new SyncTicketSummariesUseCase();

export async function handler(event: SettleContext) {
  return useCase.run(event);
}
