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

import { DispatchPayoutBatchUseCase } from "@megawin/game-power655-application/use-cases/payout";

interface Input {
  drawId: string;
}

const useCase = new DispatchPayoutBatchUseCase();

export async function handler(event: Input) {
  const result = await useCase.run({ drawId: event.drawId });
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}
