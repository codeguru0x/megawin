/**
 * Lambda: calculate-financials (Max 3D)
 *
 * Step 4 của Max3D Settle Step Function.
 * Tính toán tài chính tổng hợp từ DB (aggregate settled entries).
 * Max 3D không có Jackpot → không tính jackpotContribution / split.
 *
 * IDEMPOTENT: chạy lại cho kết quả giống nhau.
 *
 * @input  SettleContext ($settleCtx)
 * @output SettleFinancials
 */

import { CalculateFinancialsUseCase } from "@megawin/game-max3d-application/use-cases/settle";
import type { SettleContext } from "@megawin/game-max3d-application/use-cases/settle";

const useCase = new CalculateFinancialsUseCase();

export async function handler(event: SettleContext) {
  return useCase.run(event);
}
