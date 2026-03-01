/**
 * Lambda: finalize-settle (Lotto 5/35)
 *
 * Step 6 (cuối) của Lotto535 Settle Step Function.
 * Chuyển draw status: settling → settled. Ghi jackpot snapshot + update cycle.
 *
 * CRASH-SAFE: transitionStatus atomic, idempotent.
 *
 * @input  { drawId, closingJackpot, nextJackpotOpening, hasJackpotWinner, isSplitCycle, splitDetails }
 * @output FinalizeSettleResult
 */

import { FinalizeSettleUseCase } from "@megawin/game-lotto535-application/use-cases/settle";

interface Input {
  drawId: string;
  jackpotOpeningAmount: number;
  closingJackpot: number;
  nextJackpotOpening: number;
  hasJackpotWinner: boolean;
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

const useCase = new FinalizeSettleUseCase();

export async function handler(event: Input) {
  const result = await useCase.run({
    drawId: event.drawId,
    jackpotOpeningAmount: event.jackpotOpeningAmount,
    closingJackpot: event.closingJackpot,
    nextJackpotOpening: event.nextJackpotOpening,
    hasJackpotWinner: event.hasJackpotWinner,
    isSplitCycle: event.isSplitCycle,
    splitDetails: event.splitDetails,
  });
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}
