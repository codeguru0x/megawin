/**
 * Lambda: calculate-financials (Lotto 5/35)
 *
 * Step 3 của Lotto535 Settle Step Function.
 * Tính toán tài chính tổng hợp từ DB (aggregate settled entries).
 *
 * IDEMPOTENT: chạy lại cho kết quả giống nhau.
 *
 * @input  SettleContext ($settleCtx)
 * @output SettleFinancials
 */

import type { SettleContext } from "@megawin/game-lotto535-application/use-cases/settle";
import { CalculateFinancialsUseCase } from "@megawin/game-lotto535-application/use-cases/settle";

const useCase = new CalculateFinancialsUseCase();

export async function handler(event: SettleContext) {
  return useCase.run(event);
}
