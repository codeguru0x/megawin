/**
 * Lambda: tenant-dispatch main lane — fresh orders.
 *
 * EventBridge trigger: `rate(1 minute)`. Filter: `retryCount` missing.
 * Timeout 60s + `reservedConcurrency: 1` để không overlap giữa 2 invocation.
 *
 * Race giữa main và retry worker KHÔNG xảy ra: filter `$exists: false` (main)
 * và `$exists: true` (retry) mutually exclusive.
 *
 * Distributed lock phủ thêm 1 lớp chống overlap ở cold-start: nếu lock đang
 * held → return `{ skipped: true, reason: "locked" }` ngay, không chờ.
 */

import { ProcessMainDispatchBatchUseCase } from "@megawin/tenant-dispatch/use-cases/process";
import { isWorkerRunSkipped } from "@megawin/worker-core/workers";

const useCase = new ProcessMainDispatchBatchUseCase();

export async function handler() {
  const result = await useCase.run();

  if (isWorkerRunSkipped(result)) {
    console.info(`[tenant-dispatch][main] skipped: ${result.reason}`);
    return result;
  }

  console.info(`[tenant-dispatch][main] ${JSON.stringify(result)}`);
  return result;
}
