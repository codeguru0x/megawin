/**
 * Lambda: dispatch-payouts (Keno)
 *
 * Step 7 (loop) của Keno Settle Step Function.
 * Batch dispatch payout cho winning entries qua TenantGateway API.
 *
 * CRASH-SAFE: entries đã dispatched không bị gửi lại.
 *
 * @input  DispatchPayoutBatchInput
 * @output DispatchPayoutBatchResult
 */

import {
  DispatchPayoutBatchUseCase,
  type DispatchPayoutBatchInput,
} from "@megawin/game-keno-application/use-cases/payout";

const useCase = new DispatchPayoutBatchUseCase();

export async function handler(event: DispatchPayoutBatchInput) {
  return useCase.run(event);
}
