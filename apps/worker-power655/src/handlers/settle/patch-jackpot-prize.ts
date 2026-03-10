/**
 * Lambda: settle-patch-jackpot-prize (Power 6/55)
 *
 * Step 4 (conditional) trong Settle Flow — chỉ chạy khi có JP1 hoặc JP2 winner.
 * Patch tiền Jackpot thực tế (chia đều pool JP1 / JP2) vào entries + ticket lines.
 *
 * JP1 (jackpot1) và JP2 (jackpot2) được xử lý độc lập — có thể cùng kỳ cả 2 có winner.
 *
 * @input  SettleContextWithFinancials
 * @output PatchJackpotPrizeResult
 */

import {
  PatchJackpotPrizeUseCase,
  type SettleContextWithFinancials,
} from "@megawin/game-power655-application/use-cases/settle";

const useCase = new PatchJackpotPrizeUseCase();

export async function handler(event: SettleContextWithFinancials) {
  return useCase.run(event);
}
