/**
 * Lambda: void-dispatch-refunds (Max 3D Pro)
 *
 * Step 3 (loop) của Void Draw Step Function.
 * Gửi yêu cầu hoàn tiền cho tenant qua TenantGateway API.
 *
 * CRASH-SAFE: entries đã dispatch refund không bị gửi lại.
 */

import {
  DispatchRefundBatchUseCase,
  type VoidContext,
} from "@megawin/game-max3dpro-application/use-cases/void";

const useCase = new DispatchRefundBatchUseCase();

export async function handler(event: VoidContext) {
  return useCase.run(event);
}
