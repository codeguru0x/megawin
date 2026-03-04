/**
 * Lambda: void-dispatch-refunds (Mega 6/45)
 *
 * Step 3 (loop) của Void Draw Step Function.
 * Gửi yêu cầu hoàn tiền cho tenant qua TenantGateway API.
 *
 * CRASH-SAFE: entries đã dispatch refund không bị gửi lại.
 *
 * @input  { drawId }
 * @output DispatchRefundBatchResult
 */

import {
  DispatchRefundBatchUseCase,
  type DispatchRefundBatchInput,
} from "@megawin/game-mega645-application/use-cases/void";

const useCase = new DispatchRefundBatchUseCase();

export async function handler(event: DispatchRefundBatchInput) {
  return useCase.run(event);
}
