/**
 * Lambda: publish-settle-daily (void flow – Keno)
 *
 * Reuse PublishSettleDailyUseCase trong void flow để re-aggregate system reports.
 * Gọi sau BuildVoidReport: settle draw reports đã bị xoá (nếu void-after-settle)
 * → re-aggregate system_settle_game_daily và system_settle_tenant_daily giảm theo.
 *
 * IDEMPOTENT: re-aggregate toàn bộ → overwrite system reports.
 *
 * @input  { financialDate: string } (từ voidCtx)
 * @output PublishSettleDailyResult
 */

import { GameProduct } from "@megawin/game-core/entities";
import { KENO_SETTLE_DRAW_REPORTS, KENO_SETTLE_TENANT_REPORTS } from "@megawin/game-keno/entities";
import { PublishSettleDailyUseCase } from "@megawin/game-core-application/use-cases";

const useCase = new PublishSettleDailyUseCase();

export async function handler(event: { financialDate: string }) {
  return useCase.execute({
    gameProduct: GameProduct.Keno,
    financialDate: event.financialDate,
    settleDrawReportCollection: KENO_SETTLE_DRAW_REPORTS,
    settleTenantReportCollection: KENO_SETTLE_TENANT_REPORTS,
  });
}
