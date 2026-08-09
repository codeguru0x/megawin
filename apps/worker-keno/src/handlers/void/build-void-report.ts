/**
 * Lambda: build-void-report (Keno)
 *
 * Bước mới trong Keno Void Step Function (sau DispatchRefunds, trước FinalizeVoid).
 * Cleanup settle reports (nếu void-after-settle) + build void report.
 *
 * IDEMPOTENT: upsert pattern, deleteMany idempotent — crash-safe.
 *
 * @input  VoidContext ($voidCtx, bao gồm financialDate từ PrepareVoid)
 * @output BuildVoidReportResult
 */

import type { VoidContext } from "@megawin/game-keno-application/use-cases/void";
import { BuildVoidReportUseCase } from "@megawin/game-keno-application/use-cases/void";

const useCase = new BuildVoidReportUseCase();

export async function handler(event: VoidContext) {
  return useCase.run(event);
}
