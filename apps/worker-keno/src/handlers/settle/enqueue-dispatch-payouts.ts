/**
 * Lambda: enqueue-dispatch-payouts (Keno).
 *
 * Step cuối Keno Settle Step Function — thay thế `dispatch-payouts` cũ.
 *
 * Flow: query winning entries của drawId → bulk insert vào
 * `tenant_dispatch_orders` collection. Worker-tenant-dispatch sẽ poll outbox
 * và gửi tenant bất đồng bộ.
 *
 * IDEMPOTENT: replay an toàn, duplicate `tx` bị skip.
 */

import {
  EnqueueDispatchPayoutsUseCase,
  type EnqueueDispatchPayoutsInput,
} from "@megawin/game-keno-application/use-cases/settle";

const useCase = new EnqueueDispatchPayoutsUseCase();

export async function handler(event: EnqueueDispatchPayoutsInput) {
  return useCase.run(event);
}
