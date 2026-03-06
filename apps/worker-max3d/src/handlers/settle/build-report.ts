/**
 * Lambda: build-report (Max 3D)
 *
 * Step 5 của Max3D Settle Step Function.
 * Tạo/cập nhật báo cáo tài chính hàng ngày.
 *
 * IDEMPOTENT: upsert pattern.
 *
 * @input  SettleContext ($settleCtx, đã có financials)
 * @output BuildReportResult
 */

import { BuildReportUseCase } from "@megawin/game-max3d-application/use-cases/settle";
import type { SettleContext } from "@megawin/game-max3d-application/use-cases/settle";

const useCase = new BuildReportUseCase();

export async function handler(event: SettleContext) {
  return useCase.run(event);
}
