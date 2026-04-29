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
 *
 * ## Distributed lock
 *
 * Lock key `tenant-dispatch:retry`, TTL 330s (Lambda timeout 300s + 30s buffer).
 * Tách khỏi main lane để 2 lane chạy song song khi cần.
 */

import { ProcessDispatchBatchBaseUseCase } from "./process-dispatch-batch";
import type { PendingDispatchOrder } from "../../infras/repos/types";
import {
  DISPATCH_RETRY_LOCK_KEY,
  DISPATCH_RETRY_LOCK_TTL_SECONDS,
  DISPATCH_RETRY_MAX_EXECUTION_MS,
  DISPATCH_RETRY_QUERY_LIMIT,
} from "../../config";

export class ProcessRetryDispatchBatchUseCase extends ProcessDispatchBatchBaseUseCase {
  protected readonly ttlSeconds = DISPATCH_RETRY_LOCK_TTL_SECONDS;

  protected resolveLockKey(): string {
    return DISPATCH_RETRY_LOCK_KEY;
  }

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
