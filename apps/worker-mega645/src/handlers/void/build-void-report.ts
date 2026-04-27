/**
 * Lambda: build-void-report (Mega 6/45)
 *
 * Bước mới trong Mega645 Void Step Function (trước EnqueueDispatchRefunds, sau SyncTicketSummaries).
 * Cleanup settle reports (nếu void-after-settle) + build void report.
 *
 * IDEMPOTENT: upsert pattern, deleteMany idempotent — crash-safe.
 *
 * @input  VoidContext ($voidCtx, bao gồm financialDate từ PrepareVoid)
 * @output BuildVoidReportResult
 */

import { BuildVoidReportUseCase } from "@megawin/game-mega645-application/use-cases/void";
import type { VoidContext } from "@megawin/game-mega645-application/use-cases/void";

const useCase = new BuildVoidReportUseCase();

export async function handler(event: VoidContext) {
  return useCase.run(event);
}
