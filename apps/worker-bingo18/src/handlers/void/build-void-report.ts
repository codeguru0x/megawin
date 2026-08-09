/**
 * Lambda: build-void-report (Bingo 18)
 *
 * Bước mới trong Bingo 18 Void Step Function (trước EnqueueDispatchRefunds, sau SyncTicketSummaries).
 * Cleanup settle reports (nếu void-after-settle) + build void report.
 *
 * IDEMPOTENT: upsert pattern, deleteMany idempotent — crash-safe.
 *
 * @input  VoidContext ($voidCtx, bao gồm financialDate từ PrepareVoid)
 * @output BuildVoidReportResult
 */

import type { VoidContext } from "@megawin/game-bingo18-application/use-cases/void";
import { BuildVoidReportUseCase } from "@megawin/game-bingo18-application/use-cases/void";

const useCase = new BuildVoidReportUseCase();

export async function handler(event: VoidContext) {
  return useCase.run(event);
}
