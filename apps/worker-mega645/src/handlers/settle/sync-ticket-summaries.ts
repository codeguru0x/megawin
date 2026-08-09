/**
 * Lambda: settle-sync-ticket-summaries (Mega 6/45)
 *
 * Recompute ticket progress/settlement/voidSummary từ entries đã settled.
 * Step 4 trong Settle Flow — chạy sau khi CalculateFinancials hoàn tất.
 *
 * Dùng cùng use case với void flow (SyncTicketSummariesUseCase).
 * Step Function truyền toàn bộ $settleCtx (có drawId) → use case chỉ đọc drawId.
 *
 * @input  DrawSyncInput (chỉ cần { drawId })
 * @output SyncTicketSummariesResult
 */

import { type DrawSyncInput, SyncTicketSummariesUseCase } from "@megawin/game-mega645-application/use-cases/settle";

const useCase = new SyncTicketSummariesUseCase();

export async function handler(event: DrawSyncInput) {
  return useCase.run(event);
}
