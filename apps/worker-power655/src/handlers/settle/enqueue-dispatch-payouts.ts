/**
 * Lambda: settle-enqueue-dispatch-payouts (Power 6/55)
 *
 * Terminal step của Power655 Settle Step Function.
 * Bulk insert payout orders vào `tenant_dispatch_orders` outbox.
 *
 * @input  { drawId } (lấy từ $settleCtx)
 * @output EnqueueDispatchPayoutsOutput
 */

import {
  type EnqueueDispatchPayoutsInput,
  EnqueueDispatchPayoutsUseCase,
} from "@megawin/game-power655-application/use-cases/settle";

const useCase = new EnqueueDispatchPayoutsUseCase();

export async function handler(event: EnqueueDispatchPayoutsInput) {
  return useCase.run(event);
}
