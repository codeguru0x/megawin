/**
 * Lambda: enqueue-dispatch-payouts (Lotto 5/35)
 *
 * Step cuối của Settle Step Function. Bulk insert winning entries vào
 * `tenant_dispatch_orders` (outbox) — idempotent qua `payoutTx`.
 *
 * Worker `apps/worker-tenant-dispatch` poll EventBridge (1 phút) và gửi
 * sang tenant. Settle flow không chờ — kết thúc ngay sau bước này.
 *
 * @input  { drawId }
 * @output EnqueueDispatchPayoutsOutput
 */

import {
  EnqueueDispatchPayoutsUseCase,
  type EnqueueDispatchPayoutsInput,
} from "@megawin/game-lotto535-application/use-cases/settle";

const useCase = new EnqueueDispatchPayoutsUseCase();

export async function handler(event: EnqueueDispatchPayoutsInput) {
  return useCase.run(event);
}
