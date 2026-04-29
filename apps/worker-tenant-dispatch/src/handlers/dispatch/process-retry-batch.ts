/**
 * Lambda: tenant-dispatch retry lane — orders đã fail ≥ 1 lần.
 *
 * EventBridge trigger: `rate(3 minutes)`. Filter: `retryCount` exists.
 * Timeout 300s (5 phút) vì tenant gặp vấn đề có thể phản hồi chậm; cô lập khỏi
 * main lane để không block fresh orders. `reservedConcurrency: 1` giống main.
 *
 * Distributed lock phủ thêm 1 lớp chống overlap ở cold-start: nếu lock đang
 * held → return `{ skipped: true, reason: "locked" }` ngay, không chờ.
 */

import { isLockedWorkerSkipped } from "@megawin/worker-core";
import { ProcessRetryDispatchBatchUseCase } from "@megawin/tenant-dispatch/use-cases/process";

const useCase = new ProcessRetryDispatchBatchUseCase();

export async function handler() {
  const result = await useCase.run();

  if (isLockedWorkerSkipped(result)) {
    console.info(`[tenant-dispatch][retry] skipped: ${result.reason}`);
    return result;
  }

  console.info(`[tenant-dispatch][retry] ${JSON.stringify(result)}`);
  return result;
}
