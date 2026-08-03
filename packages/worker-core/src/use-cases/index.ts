// Canonical exports — dùng cho @megawin/worker-core/use-cases.
export { SingleRunWorker } from "./lock/single-run-worker";
export { TickLoopWorker } from "./lock/tick-loop-worker";
export { LockTakenOverError } from "./lock/lock-taken-over-error";
export { DistributedMutex } from "./lock/distributed-mutex";
export type {
  AcquireBusinessLockOptions,
  ReleaseBusinessLockOptions,
} from "./lock/distributed-mutex";
export { STALLED_ALERT_THRESHOLD } from "./health/stalled-item-tracker";
export { isWorkerRunSkipped } from "./types";
export type { WorkerRunResult, WorkerRunSkipped, TickLoopResult, TickOutcome } from "./types";
