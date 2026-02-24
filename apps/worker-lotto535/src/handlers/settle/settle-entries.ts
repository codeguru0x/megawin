/**
 * Lambda: settle-entries (Lotto 5/35)
 *
 * Step 3 (loop) của Lotto535 Settle Step Function.
 * Xử lý 1 batch entries: expand boards → match lines → payout → settle.
 *
 * CRASH-SAFE: entries đã settled tự filter ra bởi status.
 *
 * @input  { drawId, result, prizeAmounts, isSplitCycle, batchSize }
 * @output SettleEntriesBatchResult
 */

import { SettleEntriesBatchUseCase } from "@megawin/game-lotto535-application/use-cases/settle";

interface Input {
  drawId: string;
  result: { winningMain: number[]; winningSpecial: number };
  prizeAmounts: Record<string, number>;
  isSplitCycle: boolean;
  batchSize: number;
}

const useCase = new SettleEntriesBatchUseCase();

export async function handler(event: Input) {
  const result = await useCase.run({
    drawId: event.drawId,
    result: event.result,
    prizeAmounts: event.prizeAmounts,
    isSplitCycle: event.isSplitCycle,
    batchSize: event.batchSize,
  });
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}
