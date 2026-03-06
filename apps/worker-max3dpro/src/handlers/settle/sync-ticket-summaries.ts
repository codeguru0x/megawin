/**
 * Lambda: sync-ticket-summaries (Max 3D Pro)
 *
 * Recompute ticket progress/settlement/voidSummary từ entries.
 * Dùng chung cho cả settle pipeline và void pipeline.
 */

import {
  SyncTicketSummariesUseCase,
  type SettleContext,
} from "@megawin/game-max3dpro-application/use-cases/settle";

const useCase = new SyncTicketSummariesUseCase();

export async function handler(event: SettleContext) {
  return useCase.run(event);
}
