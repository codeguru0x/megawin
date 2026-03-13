/**
 * Lambda: publish-settle-daily (Power 6/55 – Void Flow)
 *
 * Dùng trong void flow (sau BuildVoidReport, trước FinalizeVoid).
 * Re-aggregate settle reports (sau khi đã xoá draw-level reports).
 * Settle totals tự giảm vì draw-level reports của draw vừa void đã bị xoá.
 *
 * REUSE: cùng PublishSettleDailyUseCase với settle flow.
 * IDEMPOTENT: re-aggregate toàn bộ → overwrite system reports.
 *
 * @input  { financialDate: string } (từ voidCtx)
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
