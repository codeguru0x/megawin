/**
 * Lambda: build-report (Keno)
 *
 * Step 5 của Keno Settle Step Function.
 * Tạo/cập nhật báo cáo tài chính hàng ngày.
 *
 * IDEMPOTENT: upsert pattern.
 *
 * @input  BuildReportInput
 * @output BuildReportResult
 */

import {
  BuildReportUseCase,
  type BuildReportInput,
} from "@megawin/game-keno-application/use-cases/settle";

const useCase = new BuildReportUseCase();

export async function handler(event: BuildReportInput) {
  return useCase.run(event);
}
