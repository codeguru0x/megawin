/**
 * Lambda: sync-ticket-summaries (Keno)
 *
 * Recompute ticket progress/settlement/voidSummary từ entries.
 * Dùng chung cho cả settle pipeline và void pipeline.
 *
 * @input  { drawId }
 * @output SyncTicketSummariesResult
 */

import { SyncTicketSummariesUseCase } from "@megawin/game-keno-application/use-cases/settle";

interface Input {
  drawId: string;
}

const useCase = new SyncTicketSummariesUseCase();

export async function handler(event: Input) {
  const result = await useCase.run({ drawId: event.drawId });
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}
