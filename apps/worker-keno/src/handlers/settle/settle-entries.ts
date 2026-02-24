/**
 * Lambda: settle-entries (Keno)
 *
 * Step 3 (loop) của Keno Settle Step Function.
 * Match boards + side bets → payout → settle.
 *
 * CRASH-SAFE: entries đã settled tự filter ra bởi status.
 *
 * @input  { drawId, result, config, batchSize }
 * @output SettleEntriesBatchResult
 */

import { SettleEntriesBatchUseCase } from "@megawin/game-keno-application/use-cases/settle";

interface Input {
  drawId: string;
  result: {
    winningNumbers: number[];
    bigCount: number;
    smallCount: number;
    evenCount: number;
    oddCount: number;
  };
  config: {
    basicPrizes: Record<string, Record<number, number>>;
    bigSmallPrizes: Record<string, number>;
    evenOddPrizes: Record<string, number>;
    payoutCaps: {
      pick8MaxPerDraw: number;
      pick8MaxSetsForFixed: number;
      pick9MaxPerDraw: number;
      pick9MaxSetsForFixed: number;
      pick10MaxPerDraw: number;
      pick10MaxSetsForFixed: number;
    };
  };
  batchSize: number;
}

const useCase = new SettleEntriesBatchUseCase();

export async function handler(event: Input) {
  const result = await useCase.run({
    drawId: event.drawId,
    result: event.result,
    config: event.config,
    batchSize: event.batchSize,
  });
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}
