/**
 * Lambda: prepare-settle
 *
 * Load context cho settle flow. Idempotent – chỉ đọc dữ liệu.
 */

import { type PrepareSettleInput, PrepareSettleUseCase } from "@megawin/game-lotto535-application/use-cases/settle";

const useCase = new PrepareSettleUseCase();

export async function handler(event: PrepareSettleInput) {
  return useCase.run(event);
}
