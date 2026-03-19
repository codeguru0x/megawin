/**
 * Lambda: publish-settle-daily (Bingo 18)
 *
 * Re-aggregate per-game draw-level reports → upsert system daily reports.
 *
 * IDEMPOTENT: re-aggregate toàn bộ → overwrite system reports.
 *
 * @input  SettleContextWithFinancials ($settleCtx, cần financialDate)
 * @output PublishSettleDailyResult
 */

import { PublishSettleDailyUseCase } from "@megawin/game-bingo18-application/use-cases/settle";
import type { SettleContextWithFinancials } from "@megawin/game-bingo18-application/use-cases/settle";

const useCase = new PublishSettleDailyUseCase();

export async function handler(event: SettleContextWithFinancials) {
  return useCase.run(event);
}
