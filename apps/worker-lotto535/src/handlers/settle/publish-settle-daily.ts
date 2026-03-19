/**
 * Lambda: publish-settle-daily (Lotto 5/35)
 *
 * Re-aggregate per-game draw-level reports → upsert system daily reports.
 *
 * IDEMPOTENT: re-aggregate toàn bộ → overwrite system reports.
 *
 * @input  { financialDate: string }
 * @output PublishSettleDailyResult
 */

import { PublishSettleDailyUseCase } from "@megawin/game-lotto535-application/use-cases/settle";
import type { SettleContextWithFinancials } from "@megawin/game-lotto535-application/use-cases/settle";

const useCase = new PublishSettleDailyUseCase();

export async function handler(event: SettleContextWithFinancials) {
  return useCase.run(event);
}
