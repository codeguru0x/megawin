/**
 * Lambda: build-settle-report (Power 6/55)
 *
 * Step mới của Power655 Settle Step Function (sau BuildReport cũ, trước FinalizeSettle).
 * Xây dựng per-game financial reports từ entries đã settle.
 *
 * Power 6/55 DUAL Jackpot: jackpotContribution = JP1 + JP2.
 *
 * IDEMPOTENT: upsert pattern — crash-safe, retry an toàn.
 *
 * @input  SettleContext ($settleCtx, đã có financials từ CalculateFinancials)
 * @output BuildSettleReportResult
 */

import type { SettleContext } from "@megawin/game-power655-application/use-cases/settle";
import { BuildSettleReportUseCase } from "@megawin/game-power655-application/use-cases/settle";

const useCase = new BuildSettleReportUseCase();

export async function handler(event: SettleContext) {
  return useCase.run(event);
}
