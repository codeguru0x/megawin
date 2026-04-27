/**
 * Use Case: Process **retry lane** — orders đã fail ≥ 1 lần.
 *
 * Dùng bởi Lambda `process-retry-batch` (rate 3 phút, timeout 300s). Loop
 * fetch → process → flush cho đến cạn pending hoặc chạm soft budget 285s
 * (chừa 15s trước khi Lambda kill cứng).
 *
 * Filter: `retryCount` exists. Limit mỗi iteration 100 (thấp hơn main) vì
 * tenant gặp vấn đề phản hồi chậm, cần thời gian để xử lý từng order —
 * nhưng nếu tenant đã hồi phục, loop sẽ quét hết backlog trong 1 tick.
 */

import { ProcessDispatchBatchBaseUseCase } from "./process-dispatch-batch";
import type { PendingDispatchOrder } from "../../infras/repos/types";
import { DISPATCH_RETRY_QUERY_LIMIT, DISPATCH_RETRY_MAX_EXECUTION_MS } from "../../config";

export class ProcessRetryDispatchBatchUseCase extends ProcessDispatchBatchBaseUseCase {
  protected defaultLimit(): number {
    return DISPATCH_RETRY_QUERY_LIMIT;
  }

  protected defaultMaxExecutionMs(): number {
    return DISPATCH_RETRY_MAX_EXECUTION_MS;
  }

  protected fetchPending(limit: number): Promise<PendingDispatchOrder[]> {
    return this.repo.getPendingRetryBatch(limit);
  }
}
