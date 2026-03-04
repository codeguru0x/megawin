/**
 * Lambda: dispatch-payouts (Bingo 18)
 *
 * Step 7 (loop) của Bingo 18 Settle Step Function.
 * Batch dispatch payout cho winning entries qua TenantGateway API.
 *
 * CRASH-SAFE: entries đã dispatched không bị gửi lại.
 *
 * @input  { drawId }
 * @output DispatchPayoutBatchResult
 */

import {
  DispatchPayoutBatchUseCase,
  type DispatchPayoutBatchInput,
} from "@megawin/game-bingo18-application/use-cases/payout";

const useCase = new DispatchPayoutBatchUseCase();

export async function handler(event: DispatchPayoutBatchInput) {
  return useCase.run(event);
}
