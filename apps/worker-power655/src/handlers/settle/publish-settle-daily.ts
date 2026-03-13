/**
 * Lambda: publish-settle-daily (Power 6/55)
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
  POWER655_SETTLE_DRAW_REPORTS,
  POWER655_SETTLE_TENANT_REPORTS,
} from "@megawin/game-power655/entities";
import { PublishSettleDailyUseCase } from "@megawin/game-core-application/use-cases";

const useCase = new PublishSettleDailyUseCase();

export async function handler(event: { financialDate: string }) {
  return useCase.execute({
    gameProduct: GameProduct.Power655,
    financialDate: event.financialDate,
    settleDrawReportCollection: POWER655_SETTLE_DRAW_REPORTS,
    settleTenantReportCollection: POWER655_SETTLE_TENANT_REPORTS,
  });
}
