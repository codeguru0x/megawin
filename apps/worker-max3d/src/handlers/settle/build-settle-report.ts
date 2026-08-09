/**
 * Lambda: build-settle-report (Max 3D)
 *
 * Step mới của Max 3D Settle Step Function (sau BuildReport cũ, trước FinalizeSettle).
 * Xây dựng per-game financial reports từ entries đã settle.
 *
 * IDEMPOTENT: upsert pattern — crash-safe, retry an toàn.
 *
 * @input  SettleContext ($settleCtx, đã có financials từ CalculateFinancials)
 * @output BuildSettleReportResult
 */

import type { SettleContext } from "@megawin/game-max3d-application/use-cases/settle";
import { BuildSettleReportUseCase } from "@megawin/game-max3d-application/use-cases/settle";

const useCase = new BuildSettleReportUseCase();

export async function handler(event: SettleContext) {
  return useCase.run(event);
}
