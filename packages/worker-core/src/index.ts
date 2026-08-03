// Main barrel — tất cả public exports của @megawin/worker-core.

// Entities & value types
export { WorkerCoreCollections, WorkerLockKind } from "./entities";
export type { WorkerLockDoc, WorkerLockEntity, WorkerStalledItem } from "./entities";

// Repository layer
export { WorkerLockRepository } from "./infras/repos";
export type { AcquireOptions } from "./infras/repos";

// Use cases — canonical: base worker class (extends) + mutex facade (new)
export {
  SingleRunWorker,
  TickLoopWorker,
  LockTakenOverError,
  DistributedMutex,
  STALLED_ALERT_THRESHOLD,
  isWorkerRunSkipped,
} from "./use-cases";
export type {
  WorkerRunResult,
  WorkerRunSkipped,
  AcquireBusinessLockOptions,
  ReleaseBusinessLockOptions,
} from "./use-cases";
