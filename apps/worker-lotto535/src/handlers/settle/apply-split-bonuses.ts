/**
 * Lambda: apply-split-bonuses (Lotto 5/35)
 *
 * Patch bonusPerWinner từ Jackpot split vào entry payout.
 * Chỉ chạy khi isSplitCycle = true.
 *
 * @input  { drawId, isSplitCycle, splitDetails }
 * @output ApplySplitBonusesResult
 */

import { ApplySplitBonusesUseCase } from "@megawin/game-lotto535-application/use-cases/settle";

interface Input {
  drawId: string;
  isSplitCycle: boolean;
  splitDetails?: Record<
    string,
    {
      initialAmount: number;
      redistributedAmount: number;
      totalAmount: number;
      winnerCount: number;
      bonusPerWinner: number;
    }
  >;
}

const useCase = new ApplySplitBonusesUseCase();

export async function handler(event: Input) {
  const result = await useCase.run({
    drawId: event.drawId,
    isSplitCycle: event.isSplitCycle,
    splitDetails: event.splitDetails,
  });
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}
