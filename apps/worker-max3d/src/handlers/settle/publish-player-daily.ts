/**
 * Lambda: publish-player-daily (Max 3D)
 *
 * Aggregate ticket_entries cho financialDate → group by { tenantId, accountId }
 * → delete cũ + bulk upsert player_settle_game_daily.
 *
 * IDEMPOTENT: delete + re-aggregate → overwrite player daily reports.
 *
 * @input  { financialDate: string }
 * @output PublishPlayerDailyResult
 */

import { PublishPlayerDailyUseCase } from "@megawin/game-max3d-application/use-cases/settle";
import type { SettleContextWithFinancials } from "@megawin/game-max3d-application/use-cases/settle";

const useCase = new PublishPlayerDailyUseCase();

export async function handler(event: SettleContextWithFinancials) {
  return useCase.run(event);
}
