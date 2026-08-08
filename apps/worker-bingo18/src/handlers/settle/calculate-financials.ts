/**
 * Lambda: calculate-financials (Bingo 18)
 *
 * Step 3 của Bingo 18 Settle Step Function.
 * Tính toán tài chính tổng hợp. Bingo 18 KHÔNG có Jackpot.
 *
 * IDEMPOTENT: chạy lại cho kết quả giống nhau.
 *
 * @input  SettleContext ($settleCtx)
 * @output SettleFinancials
 */

import type { SettleContext } from "@megawin/game-bingo18-application/use-cases/settle";
import { CalculateFinancialsUseCase } from "@megawin/game-bingo18-application/use-cases/settle";

const useCase = new CalculateFinancialsUseCase();

export async function handler(event: SettleContext) {
  return useCase.run(event);
}
