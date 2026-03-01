/**
 * Lambda: calculate-financials (Power 6/55)
 *
 * Step 4 của Power655 Settle Step Function.
 * Tính toán tài chính tổng hợp từ DB (aggregate settled entries).
 *
 * IDEMPOTENT: chạy lại cho kết quả giống nhau.
 *
 * @input  { drawId, jp1OpeningAmount, jp2OpeningAmount, isSplitCycle, totalLines, config }
 * @output CalculateFinancialsResult
 */

import { CalculateFinancialsUseCase } from "@megawin/game-power655-application/use-cases/settle";

interface Input {
  drawId: string;
  jp1OpeningAmount: number;
  jp2OpeningAmount: number;
  isSplitCycle: boolean;
  totalLines: number;
  config: {
    jp1SeedAmount: number;
    jp2SeedAmount: number;
    jp1Ratio: number;
    jp2Ratio: number;
    jp1OverflowThreshold: number;
    splitThreshold: number;
    splitRatios: { tier1: number; tier2: number; tier3: number };
    companyRate: number;
  };
}

const useCase = new CalculateFinancialsUseCase();

export async function handler(event: Input) {
  const result = await useCase.run({
    drawId: event.drawId,
    jp1OpeningAmount: event.jp1OpeningAmount,
    jp2OpeningAmount: event.jp2OpeningAmount,
    isSplitCycle: event.isSplitCycle,
    totalLines: event.totalLines,
    config: event.config,
  });
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}
