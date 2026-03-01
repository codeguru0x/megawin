/**
 * Lambda: prepare-settle (Mega 6/45)
 *
 * Step 1 của Mega645 Settle Step Function.
 * Load context cho settle flow. Idempotent – chỉ đọc dữ liệu.
 *
 * @input  { drawId }
 * @output PrepareSettleResult
 */

import { PrepareSettleUseCase } from "@megawin/game-mega645-application/use-cases/settle";

interface Input {
  drawId: string;
}

const useCase = new PrepareSettleUseCase();

export async function handler(event: Input) {
  const result = await useCase.run({ drawId: event.drawId });
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}
