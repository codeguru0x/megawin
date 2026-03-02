/**
 * Lambda: void-entries (Max 3D Pro)
 *
 * Step 2 (loop) của Void Draw Step Function.
 * Void 1 batch entries + update ticket voidSummary.
 *
 * CRASH-SAFE: entries đã void tự filter ra.
 *
 * @input  { drawId, reason, voidedBy?, batchSize? }
 * @output VoidEntriesBatchResult
 */

import { VoidEntriesBatchUseCase } from "@megawin/game-max3dpro-application/use-cases/void";

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
