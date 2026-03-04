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

import {
  CalculateFinancialsUseCase,
  type CalculateFinancialsInput,
} from "@megawin/game-bingo18-application/use-cases/settle";

const useCase = new CalculateFinancialsUseCase();

export async function handler(event: CalculateFinancialsInput) {
  return useCase.run(event);
}
