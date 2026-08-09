/**
 * Lambda: resettle-prepare (Max 3D Pro)
 *
 * Step 1 của Max 3D Pro Resettle SFN.
 * Snapshot reversal cho entries có payout > 0, reset entries Settled → Scheduled.
 *
 * @input  PrepareResettleInput { drawId, resettleId, lockOwnerToken }
 * @output PrepareResettleOutput
 */

import {
  type PrepareResettleInput,
  PrepareResettleUseCase,
} from "@megawin/game-max3dpro-application/use-cases/resettle";

const useCase = new PrepareResettleUseCase();

export async function handler(event: PrepareResettleInput) {
  return useCase.run(event);
}
