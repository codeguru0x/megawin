/**
 * Lambda: publish-settle-daily (Mega 6/45 – Void flow)
 *
 * Reuse PublishSettleDailyUseCase cho void flow.
 * Re-aggregate sau khi settle reports bị xoá (void-after-settle)
 * → system daily reports tự giảm để phản ánh đúng thực tế.
 *
 * IDEMPOTENT: re-aggregate toàn bộ → overwrite system reports.
 *
 * @input  { financialDate: string } (từ voidCtx)
 * @output PublishSettleDailyResult
 */

import { GameProduct } from "@megawin/game-core/entities";
import {
  MEGA645_SETTLE_DRAW_REPORTS,
  MEGA645_SETTLE_TENANT_REPORTS,
} from "@megawin/game-mega645/entities";
import { PublishSettleDailyUseCase } from "@megawin/game-core-application/use-cases";

const useCase = new PublishSettleDailyUseCase();

export async function handler(event: { financialDate: string }) {
  return useCase.execute({
    gameProduct: GameProduct.Mega645,
    financialDate: event.financialDate,
    settleDrawReportCollection: MEGA645_SETTLE_DRAW_REPORTS,
    settleTenantReportCollection: MEGA645_SETTLE_TENANT_REPORTS,
  });
}
