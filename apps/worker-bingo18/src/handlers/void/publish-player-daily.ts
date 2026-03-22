/**
 * Lambda: publish-player-daily (Bingo 18 — Void Flow)
 *
 * Re-aggregate ticket_entries cho financialDate → player_settle_game_daily.
 * Chạy sau PublishSettleDaily: entries void → player metrics tự giảm.
 * Players hết entry settled/void trong ngày → doc bị xoá (delete trước upsert).
 *
 * IDEMPOTENT: delete cũ + re-aggregate + bulk upsert mới.
 *
 * @input  VoidContext ($voidCtx)
 * @output PublishPlayerDailyResult
 */

import { PublishPlayerDailyUseCase } from "@megawin/game-bingo18-application/use-cases/settle";
import type { VoidContext } from "@megawin/game-bingo18-application/use-cases/void";

const useCase = new PublishPlayerDailyUseCase();

export async function handler(event: VoidContext) {
  return useCase.run({ financialDate: event.financialDate });
}
