/**
 * Lambda: settle-sync-ticket-summaries (Bingo 18)
 *
 * Recompute ticket progress/settlement summary từ entries đã settled.
 * Step 3 trong Settle Flow — chạy sau CalculateFinancials.
 *
 * Dùng cùng use case với void flow (SyncTicketSummariesUseCase).
 * Step Function truyền toàn bộ $settleCtx → use case chỉ đọc drawId.
 *
 * @input  DrawSyncInput (chỉ cần { drawId })
 * @output SyncTicketSummariesResult
 */

import { type DrawSyncInput, SyncTicketSummariesUseCase } from "@megawin/game-bingo18-application/use-cases/settle";

const useCase = new SyncTicketSummariesUseCase();

export async function handler(event: DrawSyncInput) {
  return useCase.run(event);
}
