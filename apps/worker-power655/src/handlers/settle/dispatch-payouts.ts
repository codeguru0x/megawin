/**
 * Lambda: dispatch-payouts (Power 6/55)
 *
 * Step 7 (loop) của Power655 Settle Step Function.
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
} from "@megawin/game-power655-application/use-cases/payout";

const useCase = new DispatchPayoutBatchUseCase();

export async function handler(event: DispatchPayoutBatchInput) {
  return useCase.run(event);
}
