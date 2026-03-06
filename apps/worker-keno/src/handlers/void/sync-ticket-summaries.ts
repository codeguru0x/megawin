/**
 * Lambda: void-sync-ticket-summaries (Keno)
 *
 * Step 3 (loop) của Void Draw Step Function.
 * Recompute ticket progress/voidSummary từ entries sau khi void.
 * Dùng chung SyncTicketSummariesUseCase với settle pipeline.
 *
 * @input  VoidContext ($voidCtx)
 * @output SyncTicketSummariesResult
 */

import { SyncTicketSummariesUseCase } from "@megawin/game-keno-application/use-cases/settle";
import type { VoidContext } from "@megawin/game-keno-application/use-cases/void";

const useCase = new SyncTicketSummariesUseCase();

export async function handler(event: VoidContext) {
  return useCase.run(event as any);
}
