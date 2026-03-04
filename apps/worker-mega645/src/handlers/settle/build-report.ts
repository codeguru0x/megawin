/**
 * Lambda: build-report (Mega 6/45)
 *
 * Step 5 của Mega645 Settle Step Function.
 * Tạo/cập nhật báo cáo tài chính hàng ngày.
 *
 * IDEMPOTENT: upsert pattern.
 *
 * @input  { drawId, financialDate, financials }
 * @output BuildReportResult
 */

import {
  BuildReportUseCase,
  type BuildReportInput,
} from "@megawin/game-mega645-application/use-cases/settle";

const useCase = new BuildReportUseCase();

export async function handler(event: BuildReportInput) {
  return useCase.run({
    drawId: event.drawId,
    financialDate: event.financialDate,
  });
}
