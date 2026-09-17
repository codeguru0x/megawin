/**
 * Lambda: enqueue-dispatch-payouts (Mega 6/45)
 *
 * Step cuối của Settle Step Function. Bulk insert winning entries vào
 * `tenant_dispatch_orders` (outbox) — idempotent qua `payoutTx`.
 *
 * Worker `apps/worker-tenant-dispatch` gửi tenant async.
 *
 * @input  { drawId }
 * @output EnqueueDispatchPayoutsOutput
 */

import {
  EnqueueDispatchPayoutsUseCase,
  type EnqueueDispatchPayoutsInput,
} from "@megawin/game-mega645-application/use-cases/settle";

const useCase = new EnqueueDispatchPayoutsUseCase();

export async function handler(event: EnqueueDispatchPayoutsInput) {
  return useCase.run(event);
}
