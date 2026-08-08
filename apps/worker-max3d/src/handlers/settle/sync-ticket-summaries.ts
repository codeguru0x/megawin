/**
 * Lambda: settle-sync-ticket-summaries (Max 3D)
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

import { SyncTicketSummariesUseCase, type DrawSyncInput } from "@megawin/game-max3d-application/use-cases/settle";

const useCase = new SyncTicketSummariesUseCase();

export async function handler(event: DrawSyncInput) {
  return useCase.run(event);
}
