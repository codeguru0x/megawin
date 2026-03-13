/**
 * Lambda: publish-settle-daily (Max 3D Pro)
 *
 * Dùng chung cho cả settle flow (sau BuildSettleReport) và void flow (trước FinalizeVoid).
 * Re-aggregate per-game draw-level reports → upsert system daily reports.
 *
 * IDEMPOTENT: re-aggregate toàn bộ → overwrite system reports.
 *
 * @input  { financialDate: string } (từ settleCtx hoặc voidCtx)
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
