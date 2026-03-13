/**
 * Lambda: build-void-report (Max 3D)
 *
 * Bước mới trong Max 3D Void Step Function (sau DispatchRefunds, trước FinalizeVoid).
 * Cleanup settle reports (nếu void-after-settle) + build void report.
 *
 * IDEMPOTENT: upsert pattern, deleteMany idempotent — crash-safe.
 *
 * @input  VoidContext ($voidCtx, bao gồm financialDate từ PrepareVoid)
 * @output BuildVoidReportResult
 */

import { BuildVoidReportUseCase } from "@megawin/game-max3d-application/use-cases/void";
import type { VoidContext } from "@megawin/game-max3d-application/use-cases/void";

const useCase = new BuildVoidReportUseCase();

export async function handler(event: VoidContext) {
  return useCase.run(event);
}
