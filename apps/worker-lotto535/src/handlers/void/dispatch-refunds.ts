/**
 * Lambda: void-dispatch-refunds (Lotto 5/35)
 *
 * Step 3 (loop) của Void Draw Step Function.
 * Gửi yêu cầu hoàn tiền cho tenant qua TenantGateway API.
 *
 * CRASH-SAFE: entries đã dispatch refund không bị gửi lại.
 *
 * @input  { drawId }
 * @output DispatchRefundBatchResult
 */

import { DispatchRefundBatchUseCase } from "@megawin/game-lotto535-application/use-cases/void";

interface Input {
  drawId: string;
}

const useCase = new DispatchRefundBatchUseCase();

export async function handler(event: Input) {
  const result = await useCase.run({ drawId: event.drawId });
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}
