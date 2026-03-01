/**
 * Lambda: prepare-settle (Power 6/55)
 *
 * Step 1 của Power655 Settle Step Function.
 * Load context cho settle flow. Idempotent – chỉ đọc dữ liệu.
 *
 * @input  { drawId }
 * @output PrepareSettleResult
 */

import { PrepareSettleUseCase } from "@megawin/game-power655-application/use-cases/settle";

interface Input {
  drawId: string;
}

const useCase = new PrepareSettleUseCase();

export async function handler(event: Input) {
  const result = await useCase.run({ drawId: event.drawId });
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}
