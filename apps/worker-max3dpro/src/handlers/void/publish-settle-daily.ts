/**
 * Lambda: publish-settle-daily (void flow – Max 3D Pro)
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
import {
  MAX3DPRO_SETTLE_DRAW_REPORTS,
  MAX3DPRO_SETTLE_TENANT_REPORTS,
} from "@megawin/game-max3dpro/entities";
import { PublishSettleDailyUseCase } from "@megawin/game-core-application/use-cases";

const useCase = new PublishSettleDailyUseCase();

export async function handler(event: { financialDate: string }) {
  return useCase.execute({
    gameProduct: GameProduct.Max3dpro,
    financialDate: event.financialDate,
    settleDrawReportCollection: MAX3DPRO_SETTLE_DRAW_REPORTS,
    settleTenantReportCollection: MAX3DPRO_SETTLE_TENANT_REPORTS,
  });
}
