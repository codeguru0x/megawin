/**
 * Lambda: tenant-dispatch retry lane — orders đã fail ≥ 1 lần.
 *
 * EventBridge trigger: `rate(3 minutes)`. Filter: `retryCount` exists.
 * Timeout 300s (5 phút) vì tenant gặp vấn đề có thể phản hồi chậm; cô lập khỏi
 * main lane để không block fresh orders. `reservedConcurrency: 1` giống main.
 */

import { ProcessRetryDispatchBatchUseCase } from "@megawin/tenant-dispatch/use-cases/process";

const useCase = new ProcessRetryDispatchBatchUseCase();

export async function handler() {
  const result = await useCase.run();
  console.info(`[tenant-dispatch][retry] ${JSON.stringify(result)}`);
  return result;
}
