/**
 * Lambda: void-sync-ticket-summaries (Bingo 18)
 *
 * Recompute ticket progress/voidSummary từ entries đã void.
 * Step 3 trong Void Flow — chạy sau khi VoidEntries hoàn tất.
 *
 * Dùng cùng use case với settle flow (SyncTicketSummariesUseCase).
 * Step Function truyền toàn bộ $voidCtx → use case chỉ đọc drawId.
 *
 * @input  DrawSyncInput (chỉ cần { drawId })
 * @output SyncTicketSummariesResult
 */

import { type DrawSyncInput, SyncTicketSummariesUseCase } from "@megawin/game-bingo18-application/use-cases/settle";

const useCase = new SyncTicketSummariesUseCase();

export async function handler(event: DrawSyncInput) {
  return useCase.run(event);
}
