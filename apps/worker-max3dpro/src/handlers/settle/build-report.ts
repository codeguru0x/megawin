/**
 * Lambda: build-report (Max 3D Pro)
 *
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
} from "@megawin/game-max3dpro-application/use-cases/settle";

const useCase = new BuildReportUseCase();

export async function handler(event: BuildReportInput) {
  return useCase.run(event);
}
