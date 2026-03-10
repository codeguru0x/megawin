/**
 * Lambda: settle-patch-jackpot-prize (Mega 6/45)
 *
 * Step 4 (conditional) trong Settle Flow — chỉ chạy khi hasJackpotWinner = true.
 * Patch tiền Jackpot thực tế (chia đều pool) vào entries + ticket lines.
 *
 * Jackpot winAmount = 0 khi SettleEntries chạy (chưa biết pool cuối kỳ).
 * Step này ghi lại số tiền chính xác sau khi CalculateFinancials hoàn tất.
 *
 * @input  SettleContextWithFinancials
 * @output PatchJackpotPrizeResult
 */

import {
  PatchJackpotPrizeUseCase,
  type SettleContextWithFinancials,
} from "@megawin/game-mega645-application/use-cases/settle";

const useCase = new PatchJackpotPrizeUseCase();

export async function handler(event: SettleContextWithFinancials) {
  return useCase.run(event);
}
