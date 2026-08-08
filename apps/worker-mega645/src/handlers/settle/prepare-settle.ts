/**
 * Lambda: prepare-settle (Mega 6/45)
 *
 * Step 1 của Mega645 Settle Step Function.
 * Load context cho settle flow. Idempotent – chỉ đọc dữ liệu.
 *
 * @input  { drawId }
 * @output SettleContext
 */

import { type PrepareSettleInput, PrepareSettleUseCase } from "@megawin/game-mega645-application/use-cases/settle";

const useCase = new PrepareSettleUseCase();

export async function handler(event: PrepareSettleInput) {
  return useCase.run(event);
}
