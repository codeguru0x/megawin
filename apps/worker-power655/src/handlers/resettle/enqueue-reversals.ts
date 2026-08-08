/**
 * Lambda: resettle-enqueue-reversals (Power 6/55)
 *
 * Step 2 của Power 6/55 Resettle SFN.
 * Cursor-paginate entries có reversal snapshot, build debit orders,
 * bulk insert vào outbox `tenant_dispatch_orders`.
 *
 * @input  EnqueueReversalsInput { drawId, resettleId, lockOwnerToken, lockKey }
 * @output EnqueueReversalsOutput
 */

import {
  type EnqueueReversalsInput,
  EnqueueReversalsUseCase,
} from "@megawin/game-power655-application/use-cases/resettle";

const useCase = new EnqueueReversalsUseCase();

export async function handler(event: EnqueueReversalsInput) {
  return useCase.run(event);
}
