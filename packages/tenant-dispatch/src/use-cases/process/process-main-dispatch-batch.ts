/**
 * Use Case: Process **main lane** — fresh orders chưa từng fail.
 *
 * Dùng bởi Lambda `process-batch` (rate 1 phút, timeout 60s). Loop fetch →
 * process → flush cho đến cạn pending hoặc chạm soft budget 55s (chừa 5s
 * cho flush log + Lambda overhead trước khi bị kill cứng ở 60s).
 *
 * Filter: `retryCount` missing. Limit mỗi iteration 500 vì 99% orders
 * thành công ngay lần đầu; trong 1 tick có thể loop vài iterations nếu
 * lượng fresh orders lớn (ví dụ ngay sau settle kỳ quay đông winners).
 */

import { ProcessDispatchBatchBaseUseCase } from "./process-dispatch-batch";
import type { PendingDispatchOrder } from "../../infras/repos/types";
import { DISPATCH_MAIN_QUERY_LIMIT, DISPATCH_MAIN_MAX_EXECUTION_MS } from "../../config";

export class ProcessMainDispatchBatchUseCase extends ProcessDispatchBatchBaseUseCase {
  protected defaultLimit(): number {
    return DISPATCH_MAIN_QUERY_LIMIT;
  }

  protected defaultMaxExecutionMs(): number {
    return DISPATCH_MAIN_MAX_EXECUTION_MS;
  }

  protected fetchPending(limit: number): Promise<PendingDispatchOrder[]> {
    return this.repo.getPendingMainBatch(limit);
  }
}
