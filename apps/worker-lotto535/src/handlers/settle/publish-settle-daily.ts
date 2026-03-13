/**
 * Lambda: publish-settle-daily (Lotto 5/35)
 *
 * Dùng chung cho cả settle flow (step 8) và void flow (bước cuối trước FinalizeVoid).
 * Re-aggregate per-game draw-level reports → upsert system daily reports.
 *
 * IDEMPOTENT: re-aggregate toàn bộ → overwrite system reports.
 *
 * @input  { financialDate: string } (từ settleCtx hoặc voidCtx)
 * @output PublishSettleDailyResult
 */

import { GameProduct } from "@megawin/game-core/entities";
import {
  LOTTO535_SETTLE_DRAW_REPORTS,
  LOTTO535_SETTLE_TENANT_REPORTS,
} from "@megawin/game-lotto535/entities";
import { PublishSettleDailyUseCase } from "@megawin/game-core-application/use-cases";

const useCase = new PublishSettleDailyUseCase();

export async function handler(event: { financialDate: string }) {
  return useCase.execute({
    gameProduct: GameProduct.Lotto535,
    financialDate: event.financialDate,
    settleDrawReportCollection: LOTTO535_SETTLE_DRAW_REPORTS,
    settleTenantReportCollection: LOTTO535_SETTLE_TENANT_REPORTS,
  });
}
