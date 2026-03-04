/**
 * Lambda: void-dispatch-refunds (Max 3D)
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
} from "@megawin/game-max3d-application/use-cases/void";

const useCase = new DispatchRefundBatchUseCase();

export async function handler(event: DispatchRefundBatchInput) {
  return useCase.run(event);
}
