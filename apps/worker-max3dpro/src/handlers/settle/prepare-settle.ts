/**
 * Lambda: prepare-settle (Max 3D Pro)
 *
 * Load context cho settle flow. Idempotent – chỉ đọc dữ liệu.
 * Max 3D Pro không có Jackpot tích lũy → không load jackpot cycle.
 */

import { type PrepareSettleInput, PrepareSettleUseCase } from "@megawin/game-max3dpro-application/use-cases/settle";

const useCase = new PrepareSettleUseCase();

export async function handler(event: PrepareSettleInput) {
  return useCase.run(event);
}
