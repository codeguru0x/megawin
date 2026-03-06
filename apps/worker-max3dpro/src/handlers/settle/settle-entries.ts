/**
 * Lambda: settle-entries (Max 3D Pro)
 *
 * Step 2 (loop) của Max3dpro Settle Step Function.
 * Xử lý 1 batch entries: load boards → match against draw result → persist lines → settle.
 *
 * CRASH-SAFE: entries đã settled tự filter ra bởi status.
 */

import {
  SettleEntriesBatchUseCase,
  type SettleContext,
} from "@megawin/game-max3dpro-application/use-cases/settle";

const useCase = new SettleEntriesBatchUseCase();

export async function handler(event: SettleContext) {
  return useCase.run(event);
}
