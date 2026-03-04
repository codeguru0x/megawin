/**
 * Lambda: prepare-settle (Max 3D)
 *
 * Load context cho settle flow. Idempotent – chỉ đọc dữ liệu.
 * Max 3D không có Jackpot tích lũy → không load jackpot cycle.
 */

import {
  PrepareSettleUseCase,
  type PrepareSettleInput,
} from "@megawin/game-max3d-application/use-cases/settle";

const useCase = new PrepareSettleUseCase();

export async function handler(event: PrepareSettleInput) {
  return useCase.run(event);
}
