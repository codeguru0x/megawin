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

import {
  CalculateFinancialsUseCase,
  type CalculateFinancialsInput,
} from "@megawin/game-mega645-application/use-cases/settle";

const useCase = new CalculateFinancialsUseCase();

export async function handler(event: CalculateFinancialsInput) {
  return useCase.run(event);
}
