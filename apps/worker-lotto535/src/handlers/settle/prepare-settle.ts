/**
 * Lambda: prepare-settle
 *
 * Load context cho settle flow. Idempotent – chỉ đọc dữ liệu.
 */

import { PrepareSettleUseCase } from "@megawin/game-lotto535-application/use-cases/settle";

interface Input {
  drawId: string;
}

const useCase = new PrepareSettleUseCase();

export async function handler(event: Input) {
  const result = await useCase.run({ drawId: event.drawId });
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}
