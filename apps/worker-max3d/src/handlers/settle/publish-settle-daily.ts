/**
 * Lambda: publish-settle-daily (Max 3D)
 *
 * Re-aggregate per-game draw-level reports → upsert system daily reports.
 *
 * IDEMPOTENT: re-aggregate toàn bộ → overwrite system reports.
 *
 * @input  { financialDate: string }
 * @output PublishSettleDailyResult
 */

import { PublishSettleDailyUseCase } from "@megawin/game-max3d-application/use-cases/settle";
import { SettleContextWithFinancials } from "@megawin/game-max3d-application/use-cases/settle";

const useCase = new PublishSettleDailyUseCase();

export async function handler(event: SettleContextWithFinancials) {
  return useCase.run({ financialDate: event.financialDate });
}
