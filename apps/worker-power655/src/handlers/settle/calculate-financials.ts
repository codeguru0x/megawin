/**
 * Lambda: calculate-financials (Power 6/55)
 *
 * Step 3 của Power655 Settle Step Function.
 * Tính toán tài chính tổng hợp từ DB (aggregate settled entries).
 *
 * IDEMPOTENT: chạy lại cho kết quả giống nhau.
 *
 * @input  SettleContext ($settleCtx)
 * @output SettleFinancials
 */

import type { SettleContext } from "@megawin/game-power655-application/use-cases/settle";
import { CalculateFinancialsUseCase } from "@megawin/game-power655-application/use-cases/settle";

const useCase = new CalculateFinancialsUseCase();

export async function handler(event: SettleContext) {
  return useCase.run(event);
}
