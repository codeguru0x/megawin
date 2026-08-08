/**
 * Lambda: prepare-settle (Power 6/55)
 *
 * Step 1 của Power655 Settle Step Function.
 * Load context cho settle flow. Idempotent – chỉ đọc dữ liệu.
 *
 * @input  { drawId }
 * @output SettleContext
 */

import { type PrepareSettleInput, PrepareSettleUseCase } from "@megawin/game-power655-application/use-cases/settle";

const useCase = new PrepareSettleUseCase();

export async function handler(event: PrepareSettleInput) {
  return useCase.run(event);
}
