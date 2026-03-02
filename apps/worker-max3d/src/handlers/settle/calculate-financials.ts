/**
 * Lambda: calculate-financials (Max 3D)
 *
 * Tính toán tài chính tổng hợp từ DB (aggregate settled entries).
 * Max 3D không có Jackpot → không tính jackpotContribution / split.
 *
 * IDEMPOTENT: chạy lại cho kết quả giống nhau.
 *
 * @input  { drawId, totalLines, config }
 * @output CalculateFinancialsResult
 */

import { CalculateFinancialsUseCase } from "@megawin/game-max3d-application/use-cases/settle";

interface Input {
  drawId: string;
  totalLines: number;
  config: {
    companyRate: number;
  };
}

const useCase = new CalculateFinancialsUseCase();

export async function handler(event: Input) {
  const result = await useCase.run({
    drawId: event.drawId,
    totalLines: event.totalLines,
    config: event.config,
  });
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}
