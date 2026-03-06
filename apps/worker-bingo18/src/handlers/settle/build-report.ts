/**
 * Lambda: build-report (Bingo 18)
 *
 * Step 5 của Bingo 18 Settle Step Function.
 * Tạo/cập nhật báo cáo tài chính hàng ngày.
 *
 * IDEMPOTENT: upsert pattern.
 *
 * @input  SettleContext ($settleCtx, đã có financials)
 * @output BuildReportResult
 */

import { BuildReportUseCase } from "@megawin/game-bingo18-application/use-cases/settle";
import type { SettleContext } from "@megawin/game-bingo18-application/use-cases/settle";

const useCase = new BuildReportUseCase();

export async function handler(event: SettleContext) {
  return useCase.run(event);
}
