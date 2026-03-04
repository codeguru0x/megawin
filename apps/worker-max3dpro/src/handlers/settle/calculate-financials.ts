/**
 * Lambda: calculate-financials (Max 3D Pro)
 *
 * Tính toán tài chính tổng hợp từ DB (aggregate settled entries).
 * Max 3D Pro không có Jackpot → không tính jackpotContribution / split.
 *
 * IDEMPOTENT: chạy lại cho kết quả giống nhau.
 *
 * @input  { drawId, totalLines, config }
 * @output CalculateFinancialsResult
 */

import {
  CalculateFinancialsUseCase,
  type CalculateFinancialsInput,
} from "@megawin/game-max3dpro-application/use-cases/settle";

const useCase = new CalculateFinancialsUseCase();

export async function handler(event: CalculateFinancialsInput) {
  return useCase.run(event);
}
