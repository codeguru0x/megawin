/**
 * Lambda: void-dispatch-refunds (Keno)
 *
 * Step 3 (loop) của Void Draw Step Function.
 * Gửi refund cho tenant qua TenantGateway API.
 *
 * @input  DispatchRefundBatchInput
 * @output DispatchRefundBatchResult
 */

import {
  DispatchRefundBatchUseCase,
  type DispatchRefundBatchInput,
} from "@megawin/game-keno-application/use-cases/void";

const useCase = new DispatchRefundBatchUseCase();

export async function handler(event: DispatchRefundBatchInput) {
  return useCase.run(event);
}
