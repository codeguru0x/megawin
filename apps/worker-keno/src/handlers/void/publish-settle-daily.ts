/**
 * Lambda: publish-settle-daily (Keno)
 *
 * Re-aggregate per-game draw-level reports → upsert system daily reports.
 * Dùng per-game system repos kế thừa từ game-core base.
 *
 * IDEMPOTENT: re-aggregate toàn bộ → overwrite system reports.
 *
 * @input  { financialDate: string }
 * @output PublishSettleDailyResult
 */

import { GameProduct } from "@megawin/game-core/entities";
import { SystemSettleGameDailyRepo, SystemSettleTenantDailyRepo } from "@megawin/game-keno-application/repos";
import { PublishSettleDailyUseCase } from "@megawin/game-core-application/use-cases";

const gameDailyRepo = new SystemSettleGameDailyRepo();
const tenantDailyRepo = new SystemSettleTenantDailyRepo();
const useCase = new PublishSettleDailyUseCase();

export async function handler(event: { financialDate: string }) {
  return useCase.execute({
    gameProduct: GameProduct.Keno,
    financialDate: event.financialDate,
    gameDailyRepo,
    tenantDailyRepo,
  });
}
