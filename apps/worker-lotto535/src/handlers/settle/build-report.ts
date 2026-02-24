/**
 * Lambda: build-report (Lotto 5/35)
 *
 * Step 5 của Lotto535 Settle Step Function.
 * Tạo/cập nhật báo cáo tài chính hàng ngày.
 *
 * IDEMPOTENT: upsert pattern.
 *
 * @input  { drawId, financialDate, financials }
 * @output BuildReportResult
 */

import { BuildReportUseCase } from "@megawin/game-lotto535-application/use-cases/settle";

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
