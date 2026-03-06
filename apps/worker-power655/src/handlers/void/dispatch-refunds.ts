/**
 * Lambda: void-dispatch-refunds (Power 6/55)
 *
 * Step 3 (loop) của Void Draw Step Function.
 * Gửi yêu cầu hoàn tiền cho tenant qua TenantGateway API.
 *
 * CRASH-SAFE: entries đã dispatch refund không bị gửi lại.
 *
 * @input  VoidContext ($voidCtx)
 * @output DispatchRefundBatchResult
 */

import { DispatchRefundBatchUseCase } from "@megawin/game-power655-application/use-cases/void";
import type { VoidContext } from "@megawin/game-power655-application/use-cases/void";

const useCase = new DispatchRefundBatchUseCase();

export async function handler(event: VoidContext) {
  return useCase.run(event);
}
