/**
 * Lambda: resettle-prepare (Power 6/55)
 *
 * Step 1 của Power 6/55 Resettle SFN.
 * Clear reversal cũ, snapshot reversal cho entries có payout > 0,
 * reset entries Settled → Scheduled.
 *
 * @input  PrepareResettleInput { drawId, resettleId, lockOwnerToken, lockKey }
 * @output PrepareResettleOutput
 */

import {
  type PrepareResettleInput,
  PrepareResettleUseCase,
} from "@megawin/game-power655-application/use-cases/resettle";

const useCase = new PrepareResettleUseCase();

export async function handler(event: PrepareResettleInput) {
  return useCase.run(event);
}
