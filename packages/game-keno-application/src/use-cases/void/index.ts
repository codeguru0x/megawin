/**
 * Keno – Void Draw Use Cases barrel export.
 *
 * Step Function flow cho huỷ cược 1 kỳ:
 *   1. PrepareVoid        → validate draw, load context → VoidContext
 *   2. VoidEntries        → batch loop: void entries + tính refund
 *   3. SyncTicketSummaries → recompute ticket progress
 *   4. DispatchRefunds    → batch loop: gửi refund cho tenant
 *   5. BuildVoidReport    → cleanup settle reports (nếu void-after-settle) + ghi void report
 *   6. FinalizeVoid       → update draw summary, đóng flow
 */

export type { VoidContext } from "./types";

export { PrepareVoidUseCase } from "./prepare-void";
export type { PrepareVoidInput } from "./prepare-void";

export { VoidEntriesBatchUseCase } from "./void-entries";
export type { VoidEntriesBatchResult } from "./void-entries";

export { DispatchRefundBatchUseCase } from "./dispatch-refunds";
export type { DispatchRefundBatchResult } from "./dispatch-refunds";

export { BuildVoidReportUseCase } from "./build-void-report";
export type { BuildVoidReportResult } from "./build-void-report";

export { FinalizeVoidUseCase } from "./finalize-void";
export type { FinalizeVoidResult } from "./finalize-void";
