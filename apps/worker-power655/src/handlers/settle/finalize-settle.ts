/**
 * Lambda: finalize-settle (Power 6/55)
 *
 * Step 6 (cuối) của Power655 Settle Step Function.
 * Chuyển draw status: settling → settled. Ghi jackpot snapshot + update cycle.
 *
 * CRASH-SAFE: transitionStatus atomic, idempotent.
 *
 * @input  FinalizeSettleInput fields
 * @output FinalizeSettleResult
 */

import { FinalizeSettleUseCase } from "@megawin/game-power655-application/use-cases/settle";

interface Input {
  drawId: string;
  jp1OpeningAmount: number;
  jp2OpeningAmount: number;
  closingJp1: number;
  closingJp2: number;
  nextJp1Opening: number;
  nextJp2Opening: number;
  hasJackpot1Winner: boolean;
  hasJackpot2Winner: boolean;
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
    jp1OpeningAmount: event.jp1OpeningAmount,
    jp2OpeningAmount: event.jp2OpeningAmount,
    closingJp1: event.closingJp1,
    closingJp2: event.closingJp2,
    nextJp1Opening: event.nextJp1Opening,
    nextJp2Opening: event.nextJp2Opening,
    hasJackpot1Winner: event.hasJackpot1Winner,
    hasJackpot2Winner: event.hasJackpot2Winner,
    isSplitCycle: event.isSplitCycle,
    splitDetails: event.splitDetails,
  });
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}
