/**
 * Lambda: publish-player-daily (Max 3D Pro)
 *
 * Aggregate ticket_entries cho financialDate → group by { tenantId, accountId }
 * → delete cũ + bulk upsert player_settle_game_daily.
 *
 * IDEMPOTENT: delete + re-aggregate → overwrite player daily reports.
 *
 * @input  SettleContext ($settleCtx — chỉ đọc `financialDate`)
 * @output PublishPlayerDailyResult
 */

import type { SettleContext } from "@megawin/game-max3dpro-application/use-cases/settle";
import { PublishPlayerDailyUseCase } from "@megawin/game-max3dpro-application/use-cases/settle";

const useCase = new PublishPlayerDailyUseCase();

export async function handler(event: SettleContext) {
  return useCase.run(event);
}
