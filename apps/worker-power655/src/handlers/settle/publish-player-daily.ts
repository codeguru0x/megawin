/**
 * Lambda: publish-player-daily (Power 6/55)
 *
 * Aggregate ticket_entries cho financialDate → group by { tenantId, accountId }
 * → delete cũ + bulk upsert player_settle_game_daily.
 *
 * IDEMPOTENT: delete + re-aggregate → overwrite player daily reports.
 *
 * @input  { financialDate: string }
 * @output PublishPlayerDailyResult
 */

import type { SettleContextWithFinancials } from "@megawin/game-power655-application/use-cases/settle";
import { PublishPlayerDailyUseCase } from "@megawin/game-power655-application/use-cases/settle";

const useCase = new PublishPlayerDailyUseCase();

export async function handler(event: SettleContextWithFinancials) {
  return useCase.run(event);
}
