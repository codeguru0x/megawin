/**
 * Lambda: build-report (Mega 6/45)
 *
 * Step 6 của Mega645 Settle Step Function.
 * Tạo/cập nhật báo cáo tài chính hàng ngày.
 *
 * IDEMPOTENT: upsert pattern.
 *
 * @input  SettleContext (có financials)
 * @output BuildReportResult
 */

import {
  BuildReportUseCase,
  type SettleContext,
} from "@megawin/game-mega645-application/use-cases/settle";

const useCase = new BuildReportUseCase();

export async function handler(event: SettleContext) {
  return useCase.run(event);
}
