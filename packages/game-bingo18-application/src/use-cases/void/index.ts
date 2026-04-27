/**
 * Bingo 18 – Void Draw Use Cases barrel export.
 *
 * Step Function flow cho huỷ cược 1 kỳ:
 *   1. PrepareVoid           → validate draw, load context → VoidContext
 *   2. VoidEntries           → batch loop: void entries + tính refund
 *   3. BuildVoidReport       → dọn dẹp settle reports + ghi void report
 *   4. FinalizeVoid          → update draw summary, đóng flow
 *   5. EnqueueDispatchRefunds → bulk insert tenant_dispatch_orders (async gửi tenant)
 */

export type { VoidContext } from "./types";

export { PrepareVoidUseCase } from "./prepare-void";
export type { PrepareVoidInput } from "./prepare-void";

export { VoidEntriesBatchUseCase } from "./void-entries";
export type { VoidEntriesBatchResult } from "./void-entries";

export { EnqueueDispatchRefundsUseCase } from "./enqueue-dispatch-refunds";
export type { EnqueueDispatchRefundsOutput } from "./enqueue-dispatch-refunds";

export { BuildVoidReportUseCase } from "./build-void-report";
export type { BuildVoidReportResult } from "./build-void-report";

export { FinalizeVoidUseCase } from "./finalize-void";
export type { FinalizeVoidResult } from "./finalize-void";
