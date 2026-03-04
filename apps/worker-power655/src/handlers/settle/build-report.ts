/**
 * Lambda: build-report (Power 6/55)
 *
 * Step 5 của Power655 Settle Step Function.
 * Tạo/cập nhật báo cáo tài chính hàng ngày.
 *
 * IDEMPOTENT: upsert pattern.
 *
 * @input  { drawId, drawDate, financialDate, financials }
 * @output BuildReportResult
 */

import {
  BuildReportUseCase,
  type BuildReportInput,
} from "@megawin/game-power655-application/use-cases/settle";

const useCase = new BuildReportUseCase();

export async function handler(event: BuildReportInput) {
  return useCase.run({
    drawId: event.drawId,
    financialDate: event.financialDate,
  });
}
