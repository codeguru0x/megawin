/**
 * Lambda: build-void-report (Lotto 5/35)
 *
 * Bước mới trong Lotto535 Void Step Function (trước EnqueueDispatchRefunds, sau SyncTicketSummaries).
 * Cleanup settle reports (nếu void-after-settle) + build void report.
 *
 * IDEMPOTENT: upsert pattern, deleteMany idempotent — crash-safe.
 *
 * @input  VoidContext ($voidCtx, bao gồm financialDate từ PrepareVoid)
 * @output BuildVoidReportResult
 */

import type { VoidContext } from "@megawin/game-lotto535-application/use-cases/void";
import { BuildVoidReportUseCase } from "@megawin/game-lotto535-application/use-cases/void";

const useCase = new BuildVoidReportUseCase();

export async function handler(event: VoidContext) {
  return useCase.run(event);
}
