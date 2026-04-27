/**
 * Lambda: enqueue-dispatch-refunds (Keno).
 *
 * Step cuối Keno Void Step Function — thay thế `dispatch-refunds` cũ.
 *
 * Flow: query voided entries của drawId → bulk insert vào
 * `tenant_dispatch_orders` collection. Worker-tenant-dispatch sẽ poll outbox
 * và gửi tenant bất đồng bộ.
 *
 * IDEMPOTENT: replay an toàn, duplicate `tx` bị skip.
 */

import { EnqueueDispatchRefundsUseCase } from "@megawin/game-keno-application/use-cases/void";
import type { VoidContext } from "@megawin/game-keno-application/use-cases/void";

const useCase = new EnqueueDispatchRefundsUseCase();

export async function handler(event: VoidContext) {
  return useCase.run(event);
}
