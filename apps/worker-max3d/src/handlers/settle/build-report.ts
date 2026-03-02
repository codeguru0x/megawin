/**
 * Lambda: build-report (Max 3D)
 *
 * Tạo/cập nhật báo cáo tài chính hàng ngày.
 *
 * IDEMPOTENT: upsert pattern.
 *
 * @input  { drawId, financialDate, financials }
 * @output BuildReportResult
 */

import { BuildReportUseCase } from "@megawin/game-max3d-application/use-cases/settle";

interface Input {
  drawId: string;
  financialDate: string;
  financials?: Record<string, unknown>;
}

const useCase = new BuildReportUseCase();

export async function handler(event: Input) {
  const result = await useCase.run({
    drawId: event.drawId,
    financialDate: event.financialDate,
  });
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}
