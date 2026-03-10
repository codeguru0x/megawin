/**
 * Lambda: void-sync-ticket-summaries (Max 3D Pro)
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

import {
  SyncTicketSummariesUseCase,
  type DrawSyncInput,
} from "@megawin/game-max3dpro-application/use-cases/settle";

const useCase = new SyncTicketSummariesUseCase();

export async function handler(event: DrawSyncInput) {
  return useCase.run(event);
}
