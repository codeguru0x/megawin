/**
 * Lambda: build-report (Bingo 18)
 *
 * Step 5 của Bingo 18 Settle Step Function.
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
} from "@megawin/game-bingo18-application/use-cases/settle";

const useCase = new BuildReportUseCase();

export async function handler(event: BuildReportInput) {
  return useCase.run(event);
}
