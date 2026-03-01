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

import { BuildReportUseCase } from "@megawin/game-power655-application/use-cases/settle";

interface Input {
  drawId: string;
  drawDate: string;
  financialDate: string;
  financials: Record<string, unknown>;
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
