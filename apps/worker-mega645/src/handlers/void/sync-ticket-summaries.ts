/**
 * Lambda: void-sync-ticket-summaries (Mega 6/45)
 *
 * Recompute ticket progress/voidSummary từ entries đã void.
 * Step 3 trong Void Flow — chạy sau khi VoidEntries hoàn tất.
 *
 * Dùng cùng use case với settle flow (SyncTicketSummariesUseCase).
 * Step Function truyền toàn bộ $voidCtx (có drawId) → use case chỉ đọc drawId.
 *
 * @input  DrawSyncInput (chỉ cần { drawId })
 * @output SyncTicketSummariesResult
 */

import { SyncTicketSummariesUseCase, type DrawSyncInput } from "@megawin/game-mega645-application/use-cases/settle";

const useCase = new SyncTicketSummariesUseCase();

export async function handler(event: DrawSyncInput) {
  return useCase.run(event);
}
