/**
 * Lambda: calculate-financials (Mega 6/45)
 *
 * Step 4 của Mega645 Settle Step Function.
 * Tính toán tài chính tổng hợp từ DB (aggregate settled entries).
 *
 * Single jackpot (not dual JP1/JP2). SplitRatios: tier1, tier2, tier3.
 *
 * IDEMPOTENT: chạy lại cho kết quả giống nhau.
 *
 * @input  { drawId, jackpotOpeningAmount, isSplitCycle, totalLines, config }
 * @output CalculateFinancialsResult
 */

import { CalculateFinancialsUseCase } from "@megawin/game-mega645-application/use-cases/settle";

interface Input {
  drawId: string;
  jackpotOpeningAmount: number;
  isSplitCycle: boolean;
  totalLines: number;
  config: {
    seedAmount: number;
    splitThreshold: number;
    splitRatios: { tier1: number; tier2: number; tier3: number };
    companyRate: number;
  };
}

const useCase = new CalculateFinancialsUseCase();

export async function handler(event: Input) {
  const result = await useCase.run({
    drawId: event.drawId,
    jackpotOpeningAmount: event.jackpotOpeningAmount,
    isSplitCycle: event.isSplitCycle,
    totalLines: event.totalLines,
    config: event.config,
  });
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}
