/**
 * Lambda: build-report (Lotto 5/35)
 *
 * Step 6 của Lotto535 Settle Step Function.
 * Tạo/cập nhật báo cáo tài chính hàng ngày.
 *
 * IDEMPOTENT: upsert pattern.
 *
 * @input  SettleContext ($settleCtx, đã có financials)
 * @output BuildReportResult
 */

import { BuildReportUseCase } from "@megawin/game-lotto535-application/use-cases/settle";
import type { SettleContext } from "@megawin/game-lotto535-application/use-cases/settle";

const useCase = new BuildReportUseCase();

export async function handler(event: SettleContext) {
  return useCase.run(event);
}
