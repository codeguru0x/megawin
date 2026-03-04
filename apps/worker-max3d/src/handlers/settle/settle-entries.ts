/**
 * Lambda: settle-entries (Max 3D)
 *
 * Step 2 (loop) của Max3D Settle Step Function.
 * Xử lý 1 batch entries: load boards → match against draw result → persist lines → settle.
 *
 * CRASH-SAFE: entries đã settled tự filter ra bởi status.
 *
 * @input  { drawId, result, prizeConfig }
 * @output SettleEntriesBatchResult
 */

import {
  SettleEntriesBatchUseCase,
  type SettleEntriesBatchInput,
} from "@megawin/game-max3d-application/use-cases/settle";

const useCase = new SettleEntriesBatchUseCase();

export async function handler(event: SettleEntriesBatchInput) {
  return useCase.run(event);
}
