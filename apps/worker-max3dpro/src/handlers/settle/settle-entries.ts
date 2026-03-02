/**
 * Lambda: settle-entries (Max 3D Pro)
 *
 * Step 3 (loop) của Max3dpro Settle Step Function.
 * Xử lý 1 batch entries: load boards → match against draw result → persist lines → settle.
 *
 * CRASH-SAFE: entries đã settled tự filter ra bởi status.
 *
 * @input  { drawId, result, prizeConfig, batchSize }
 * @output SettleEntriesBatchResult
 */

import { SettleEntriesBatchUseCase } from "@megawin/game-max3dpro-application/use-cases/settle";

interface Input {
  drawId: string;
  result: {
    special: [string, string];
    first: [string, string, string, string];
    second: [string, string, string, string, string, string];
    third: [string, string, string, string, string, string, string, string];
  };
  prizeConfig: {
    standard: {
      special: number;
      specialSub: number;
      first: number;
      second: number;
      third: number;
      fourth: number;
      fifth: number;
      sixth: number;
    };
  };
  batchSize: number;
}

const useCase = new SettleEntriesBatchUseCase();

export async function handler(event: Input) {
  const result = await useCase.run({
    drawId: event.drawId,
    result: event.result,
    prizeConfig: event.prizeConfig,
    batchSize: event.batchSize,
  });
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}
