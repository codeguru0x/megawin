/**
 * Lambda: publish-settle-daily (Keno)
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
