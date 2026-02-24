/**
 * Lambda: void-entries (Keno)
 *
 * Step 2 (loop) của Void Draw Step Function.
 * Void 1 batch entries + update ticket voidSummary.
 *
 * @input  { drawId, reason, voidedBy?, batchSize? }
 * @output VoidEntriesBatchResult
 */

import { VoidEntriesBatchUseCase } from "@megawin/game-keno-application/use-cases/void";

interface Input {
  drawId: string;
  reason: string;
  voidedBy?: string;
  batchSize?: number;
}

const useCase = new VoidEntriesBatchUseCase();

export async function handler(event: Input) {
  const result = await useCase.run({
    drawId: event.drawId,
    reason: event.reason,
    voidedBy: event.voidedBy,
    batchSize: event.batchSize,
  });
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}
