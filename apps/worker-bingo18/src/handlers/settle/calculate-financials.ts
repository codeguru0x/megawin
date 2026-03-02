/**
 * Lambda: calculate-financials (Bingo 18)
 *
 * Step 4 của Bingo 18 Settle Step Function.
 * Tính toán tài chính tổng hợp. Bingo 18 KHÔNG có Jackpot.
 *
 * IDEMPOTENT: chạy lại cho kết quả giống nhau.
 *
 * @input  { drawId, config: { companyRate } }
 * @output CalculateFinancialsResult
 */

import { CalculateFinancialsUseCase } from "@megawin/game-bingo18-application/use-cases/settle";

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
