/**
 * Lambda: publish-settle-daily (Bingo 18)
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
  BINGO18_SETTLE_DRAW_REPORTS,
  BINGO18_SETTLE_TENANT_REPORTS,
} from "@megawin/game-bingo18/entities";
import { PublishSettleDailyUseCase } from "@megawin/game-core-application/use-cases";

const useCase = new PublishSettleDailyUseCase();

export async function handler(event: { financialDate: string }) {
  return useCase.execute({
    gameProduct: GameProduct.Bingo18,
    financialDate: event.financialDate,
    settleDrawReportCollection: BINGO18_SETTLE_DRAW_REPORTS,
    settleTenantReportCollection: BINGO18_SETTLE_TENANT_REPORTS,
  });
}
