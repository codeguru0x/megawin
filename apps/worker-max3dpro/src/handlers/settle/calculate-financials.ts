/**
 * Lambda: calculate-financials (Max 3D Pro)
 *
 * Tính toán tài chính tổng hợp từ DB (aggregate settled entries).
 * Max 3D Pro không có Jackpot → không tính jackpotContribution / split.
 *
 * IDEMPOTENT: chạy lại cho kết quả giống nhau.
 */

import {
  CalculateFinancialsUseCase,
  type SettleContext,
} from "@megawin/game-max3dpro-application/use-cases/settle";

const useCase = new CalculateFinancialsUseCase();

export async function handler(event: SettleContext) {
  return useCase.run(event);
}
