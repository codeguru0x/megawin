/**
 * Lambda: sync-ticket-summaries (Keno)
 *
 * Recompute ticket progress/settlement/voidSummary từ entries.
 * Dùng chung cho cả settle pipeline và void pipeline.
 *
 * @input  SyncTicketSummariesInput
 * @output SyncTicketSummariesResult
 */

import {
  SyncTicketSummariesUseCase,
  type SyncTicketSummariesInput,
} from "@megawin/game-keno-application/use-cases/settle";

const useCase = new SyncTicketSummariesUseCase();

export async function handler(event: SyncTicketSummariesInput) {
  return useCase.run(event);
}
