/**
 * Lambda: enqueue-dispatch-refunds (Lotto 5/35)
 *
 * Step cuối của Void Step Function. Bulk insert voided entries vào
 * `tenant_dispatch_orders` (outbox) — idempotent qua `refundTx`.
 *
 * Worker `apps/worker-tenant-dispatch` xử lý async.
 *
 * @input  VoidContext
 * @output EnqueueDispatchRefundsOutput
 */

import { EnqueueDispatchRefundsUseCase } from "@megawin/game-lotto535-application/use-cases/void";
import type { VoidContext } from "@megawin/game-lotto535-application/use-cases/void";

const useCase = new EnqueueDispatchRefundsUseCase();

export async function handler(event: VoidContext) {
  return useCase.run(event);
}
