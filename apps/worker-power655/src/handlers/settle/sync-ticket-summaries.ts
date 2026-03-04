/**
 * Lambda: sync-ticket-summaries (Power 6/55)
 *
 * Recompute ticket progress/settlement/voidSummary từ entries.
 * Dùng chung cho cả settle pipeline và void pipeline.
 *
 * @input  { drawId }
 * @output SyncTicketSummariesResult
 */

import {
  SyncTicketSummariesUseCase,
  type SyncTicketSummariesInput,
} from "@megawin/game-power655-application/use-cases/settle";

const useCase = new SyncTicketSummariesUseCase();

export async function handler(event: SyncTicketSummariesInput) {
  return useCase.run(event);
}
