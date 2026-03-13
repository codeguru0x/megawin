/**
 * Lambda: build-settle-report (Mega 6/45)
 *
 * Step mới của Mega645 Settle Step Function (sau BuildReport cũ, trước FinalizeSettle).
 * Xây dựng per-game financial reports từ entries đã settle.
 *
 * IDEMPOTENT: upsert pattern — crash-safe, retry an toàn.
 *
 * @input  SettleContext ($settleCtx, đã có financials từ CalculateFinancials)
 * @output BuildSettleReportResult
 */

import { BuildSettleReportUseCase } from "@megawin/game-mega645-application/use-cases/settle";
import type { SettleContext } from "@megawin/game-mega645-application/use-cases/settle";

const useCase = new BuildSettleReportUseCase();

export async function handler(event: SettleContext) {
  return useCase.run(event);
}
