/**
 * Lambda: void-enqueue-dispatch-refunds (Power 6/55)
 *
 * Terminal step của Void Draw Step Function.
 * Bulk insert refund orders vào `tenant_dispatch_orders` outbox.
 *
 * @input  VoidContext ($voidCtx)
 * @output EnqueueDispatchRefundsOutput
 */

import type { VoidContext } from "@megawin/game-power655-application/use-cases/void";
import { EnqueueDispatchRefundsUseCase } from "@megawin/game-power655-application/use-cases/void";

const useCase = new EnqueueDispatchRefundsUseCase();

export async function handler(event: VoidContext) {
  return useCase.run(event);
}
