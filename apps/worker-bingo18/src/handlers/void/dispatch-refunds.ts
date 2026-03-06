/**
 * Lambda: void-dispatch-refunds (Bingo 18)
 *
 * Step 3 (loop) của Void Draw Step Function.
 * Gửi refund cho tenant qua TenantGateway API.
 *
 * CRASH-SAFE: entries đã dispatch refund không bị gửi lại.
 *
 * @input  VoidContext ($voidCtx)
 * @output DispatchRefundBatchResult
 */

import { DispatchRefundBatchUseCase } from "@megawin/game-bingo18-application/use-cases/void";
import type { VoidContext } from "@megawin/game-bingo18-application/use-cases/void";

const useCase = new DispatchRefundBatchUseCase();

export async function handler(event: VoidContext) {
  return useCase.run(event);
}
