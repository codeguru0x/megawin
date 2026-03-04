/**
 * Lambda: void-dispatch-refunds (Bingo 18)
 *
 * Step 3 (loop) của Void Draw Step Function.
 * Gửi refund cho tenant qua TenantGateway API.
 *
 * @input  { drawId }
 * @output DispatchRefundBatchResult
 */

import {
  DispatchRefundBatchUseCase,
  type DispatchRefundBatchInput,
} from "@megawin/game-bingo18-application/use-cases/void";

const useCase = new DispatchRefundBatchUseCase();

export async function handler(event: DispatchRefundBatchInput) {
  return useCase.run(event);
}
