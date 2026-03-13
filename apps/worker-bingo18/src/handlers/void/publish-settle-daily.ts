/**
 * Lambda: publish-settle-daily (Bingo 18 – Void flow)
 *
 * Reuse cùng PublishSettleDailyUseCase từ settle flow.
 * Gọi sau BuildVoidReport để re-aggregate system daily reports:
 * settle totals tự giảm vì draw-level settle reports đã bị xoá.
 *
 * IDEMPOTENT: re-aggregate toàn bộ → overwrite system reports.
 *
 * @input  { financialDate: string } (từ voidCtx)
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
