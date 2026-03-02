/**
 * Lambda: prepare-settle (Max 3D Pro)
 *
 * Load context cho settle flow. Idempotent – chỉ đọc dữ liệu.
 * Max 3D Pro không có Jackpot tích lũy → không load jackpot cycle.
 */

import { PrepareSettleUseCase } from "@megawin/game-max3dpro-application/use-cases/settle";

interface Input {
  drawId: string;
}

const useCase = new PrepareSettleUseCase();

export async function handler(event: Input) {
  const result = await useCase.run({ drawId: event.drawId });
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}
