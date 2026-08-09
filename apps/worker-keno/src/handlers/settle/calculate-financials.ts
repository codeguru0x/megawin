/**
 * Lambda: calculate-financials (Keno)
 *
 * Tính toán tài chính tổng hợp. Keno KHÔNG có Jackpot.
 *
 * IDEMPOTENT: chạy lại cho kết quả giống nhau.
 *
 * @input  SettleContext ($settleCtx)
 * @output SettleFinancials
 */

import type { SettleContext } from "@megawin/game-keno-application/use-cases/settle";
import { CalculateFinancialsUseCase } from "@megawin/game-keno-application/use-cases/settle";

const useCase = new CalculateFinancialsUseCase();

export async function handler(event: SettleContext) {
  return useCase.run(event);
}
