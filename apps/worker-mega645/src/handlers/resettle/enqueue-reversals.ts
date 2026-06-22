/**
 * Lambda: resettle-enqueue-reversals (Mega 6/45)
 *
 * Step 2 của Mega 6/45 Resettle SFN.
 * Cursor-paginate entries có reversal snapshot, build debit orders,
 * bulk insert vào outbox `tenant_dispatch_orders`.
 *
 * @input  EnqueueReversalsInput { drawId, resettleId, lockOwnerToken, lockKey }
 * @output EnqueueReversalsOutput
 */

import {
  EnqueueReversalsUseCase,
  type EnqueueReversalsInput,
} from "@megawin/game-mega645-application/use-cases/resettle";

const useCase = new EnqueueReversalsUseCase();

export async function handler(event: EnqueueReversalsInput) {
  return useCase.run(event);
}
