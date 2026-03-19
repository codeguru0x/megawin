/**
 * Lambda: publish-settle-daily (Power 6/55)
 *
 * Re-aggregate per-game draw-level reports → upsert system daily reports.
 *
 * IDEMPOTENT: re-aggregate toàn bộ → overwrite system reports.
 *
 * @input  { financialDate: string }
 * @output PublishSettleDailyResult
 */

import { PublishSettleDailyUseCase } from "@megawin/game-power655-application/use-cases/settle";
import type { SettleContextWithFinancials } from "@megawin/game-power655-application/use-cases/settle";

const useCase = new PublishSettleDailyUseCase();

export async function handler(event: SettleContextWithFinancials) {
  return useCase.run(event);
}
