/**
 * Lambda: void-sync-ticket-summaries (Keno)
 *
 * Step 3 (loop) của Void Draw Step Function.
 * Recompute ticket progress/voidSummary từ entries sau khi void.
 * Dùng chung SyncTicketSummariesUseCase với settle pipeline.
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
