/**
 * Lambda: resettle-prepare (Keno)
 *
 * Step 1 của Keno Resettle SFN.
 * Snapshot reversal cho entries có payout > 0, reset entries Settled → Scheduled.
 *
 * @input  PrepareResettleInput { drawId, resettleId, lockOwnerToken }
 * @output PrepareResettleOutput
 */

import { PrepareResettleUseCase, type PrepareResettleInput } from "@megawin/game-keno-application/use-cases/resettle";

const useCase = new PrepareResettleUseCase();

export async function handler(event: PrepareResettleInput) {
  return useCase.run(event);
}
