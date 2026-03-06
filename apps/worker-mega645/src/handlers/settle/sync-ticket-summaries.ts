/**
 * Lambda: sync-ticket-summaries (Mega 6/45)
 *
 * Recompute ticket progress/settlement/voidSummary từ entries.
 * Dùng chung cho cả settle pipeline và void pipeline.
 *
 * @input  SettleContext
 * @output SyncTicketSummariesResult
 */

import {
  SyncTicketSummariesUseCase,
  type SettleContext,
} from "@megawin/game-mega645-application/use-cases/settle";

const useCase = new SyncTicketSummariesUseCase();

export async function handler(event: SettleContext) {
  return useCase.run(event);
}
