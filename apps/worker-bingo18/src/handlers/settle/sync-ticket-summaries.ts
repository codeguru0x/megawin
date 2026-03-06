/**
 * Lambda: sync-ticket-summaries (Bingo 18)
 *
 * Recompute ticket progress/settlement/voidSummary từ entries.
 * Dùng chung cho cả settle pipeline và void pipeline.
 *
 * @input  SettleContext ($settleCtx)
 * @output SyncTicketSummariesResult
 */

import { SyncTicketSummariesUseCase } from "@megawin/game-bingo18-application/use-cases/settle";
import type { SettleContext } from "@megawin/game-bingo18-application/use-cases/settle";

const useCase = new SyncTicketSummariesUseCase();

export async function handler(event: SettleContext) {
  return useCase.run(event);
}
