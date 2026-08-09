/**
 * Lambda: enqueue-dispatch-refunds (Mega 6/45)
 *
 * Step cuối của Void Step Function. Bulk insert voided entries vào
 * `tenant_dispatch_orders` (outbox) — idempotent qua `refundTx`.
 *
 * @input  VoidContext
 * @output EnqueueDispatchRefundsOutput
 */

import type { VoidContext } from "@megawin/game-mega645-application/use-cases/void";
import { EnqueueDispatchRefundsUseCase } from "@megawin/game-mega645-application/use-cases/void";

const useCase = new EnqueueDispatchRefundsUseCase();

export async function handler(event: VoidContext) {
  return useCase.run(event);
}
