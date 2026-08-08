// Main barrel — tất cả public exports của @megawin/worker-core.

export type { WorkerLockDoc, WorkerLockEntity, WorkerStalledItem } from "./entities";
// Entities & value types
export { WorkerCoreCollections, WorkerLockKind } from "./entities";
export type { AcquireOptions } from "./infras/repos";
// Repository layer
export { WorkerLockRepository } from "./infras/repos";
export type {
  AcquireBusinessLockOptions,
  ReleaseBusinessLockOptions,
  WorkerRunResult,
  WorkerRunSkipped,
} from "./use-cases";
// Use cases — canonical: base worker class (extends) + mutex facade (new)
export {
  DistributedMutex,
  isWorkerRunSkipped,
  LockTakenOverError,
  SingleRunWorker,
  STALLED_ALERT_THRESHOLD,
  TickLoopWorker,
} from "./use-cases";
