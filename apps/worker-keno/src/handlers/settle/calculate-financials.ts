/**
 * Lambda: calculate-financials (Keno)
 *
 * Step 4 của Keno Settle Step Function.
 * Tính toán tài chính tổng hợp. Keno KHÔNG có Jackpot.
 *
 * IDEMPOTENT: chạy lại cho kết quả giống nhau.
 *
 * @input  CalculateFinancialsInput
 * @output CalculateFinancialsResult
 */

import {
  CalculateFinancialsUseCase,
  type CalculateFinancialsInput,
} from "@megawin/game-keno-application/use-cases/settle";

const useCase = new CalculateFinancialsUseCase();

export async function handler(event: CalculateFinancialsInput) {
  return useCase.run(event);
}
