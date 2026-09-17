/**
 * Lambda: settle-sync-ticket-summaries (Lotto 5/35)
 *
 * Recompute ticket progress/settlement/voidSummary từ entries.
 * Dùng chung cho cả settle pipeline và void pipeline.
 *
 * Step Function truyền toàn bộ $settleCtx (có drawId) → use case chỉ đọc drawId.
 *
 * @input  DrawSyncInput (chỉ cần { drawId })
 * @output SyncTicketSummariesResult
 */

import { SyncTicketSummariesUseCase, type DrawSyncInput } from "@megawin/game-lotto535-application/use-cases/settle";

const useCase = new SyncTicketSummariesUseCase();

export async function handler(event: DrawSyncInput) {
  return useCase.run(event);
}
