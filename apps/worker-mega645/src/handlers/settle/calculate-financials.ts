/**
 * Lambda: calculate-financials (Mega 6/45)
 *
 * Step 3 của Mega645 Settle Step Function.
 * Tính toán tài chính tổng hợp từ DB (aggregate settled entries).
 *
 * IDEMPOTENT: chạy lại cho kết quả giống nhau.
 *
 * @input  SettleContext
 * @output SettleFinancials
 */

import {
  CalculateFinancialsUseCase,
  type SettleContext,
} from "@megawin/game-mega645-application/use-cases/settle";

const useCase = new CalculateFinancialsUseCase();

export async function handler(event: SettleContext) {
  return useCase.run(event);
}
