/**
 * Lambda: calculate-financials (Keno)
 *
 * Step 4 của Keno Settle Step Function.
 * Tính toán tài chính tổng hợp. Keno KHÔNG có Jackpot.
 *
 * IDEMPOTENT: chạy lại cho kết quả giống nhau.
 *
 * @input  { drawId, config: { companyRate } }
 * @output CalculateFinancialsResult
 */

import { CalculateFinancialsUseCase } from "@megawin/game-keno-application/use-cases/settle";

interface Input {
  drawId: string;
  config: {
    companyRate: number;
  };
}

const useCase = new CalculateFinancialsUseCase();

export async function handler(event: Input) {
  const result = await useCase.run({
    drawId: event.drawId,
    config: event.config,
  });
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}
