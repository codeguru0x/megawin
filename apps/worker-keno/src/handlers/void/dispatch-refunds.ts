/**
 * Lambda: void-dispatch-refunds (Keno)
 *
 * Step 3 (loop) của Void Draw Step Function.
 * Gửi refund cho tenant qua TenantGateway API.
 *
 * @input  { drawId }
 * @output DispatchRefundBatchResult
 */

import { DispatchRefundBatchUseCase } from "@megawin/game-keno-application/use-cases/void";

interface Input {
  drawId: string;
}

const useCase = new DispatchRefundBatchUseCase();

export async function handler(event: Input) {
  const result = await useCase.run({ drawId: event.drawId });
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}
