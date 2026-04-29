// Main barrel — tất cả public exports của @megawin/worker-core.

// Entities & value types
export { WorkerCoreCollections } from "./entities";
export type { WorkerLockDoc, WorkerLockEntity } from "./entities";

// Repository layer
export { WorkerLockRepository } from "./infras/repos";
export type { AcquireOptions } from "./infras/repos";

// Use cases — distributed lock base class
export { LockedWorkerUseCase, isLockedWorkerSkipped } from "./use-cases";
export type { LockedWorkerResult, LockedWorkerSkipped } from "./use-cases";
