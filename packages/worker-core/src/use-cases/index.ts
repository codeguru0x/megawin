// Canonical exports — dùng cho @megawin/worker-core/use-cases.

export { STALLED_ALERT_THRESHOLD } from "./health/stalled-item-tracker";
export type {
  AcquireBusinessLockOptions,
  ReleaseBusinessLockOptions,
} from "./lock/distributed-mutex";
export { DistributedMutex } from "./lock/distributed-mutex";
export { LockTakenOverError } from "./lock/lock-taken-over-error";
export { SingleRunWorker } from "./lock/single-run-worker";
export { TickLoopWorker } from "./lock/tick-loop-worker";
export type { TickLoopResult, TickOutcome, WorkerRunResult, WorkerRunSkipped } from "./types";
export { isWorkerRunSkipped } from "./types";
