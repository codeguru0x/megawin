/**
 * Lambda: sync-ticket-summaries (Max 3D)
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
} from "@megawin/game-max3d-application/use-cases/settle";

const useCase = new SyncTicketSummariesUseCase();

export async function handler(event: SyncTicketSummariesInput) {
  return useCase.run(event);
}
