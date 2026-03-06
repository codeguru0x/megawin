/**
 * Lambda: void-dispatch-refunds (Keno)
 *
 * Step 4 (loop) của Void Draw Step Function.
 * Gửi refund cho tenant qua TenantGateway API.
 *
 * @input  VoidContext ($voidCtx)
 * @output DispatchRefundBatchResult
 */

import { DispatchRefundBatchUseCase } from "@megawin/game-keno-application/use-cases/void";
import type { VoidContext } from "@megawin/game-keno-application/use-cases/void";

const useCase = new DispatchRefundBatchUseCase();

export async function handler(event: VoidContext) {
  return useCase.run(event);
}
