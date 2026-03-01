/**
 * Lambda: finalize-settle (Mega 6/45)
 *
 * Step 6 (cuối) của Mega645 Settle Step Function.
 * Chuyển draw status: settling → settled. Ghi jackpot snapshot + update cycle.
 *
 * Single jackpot (not dual JP1/JP2 like Power 6/55).
 *
 * CRASH-SAFE: transitionStatus atomic, idempotent.
 *
 * @input  FinalizeSettleInput fields
 * @output FinalizeSettleResult
 */

import { FinalizeSettleUseCase } from "@megawin/game-mega645-application/use-cases/settle";

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
