/**
 * Collection names cho package `@megawin/worker-core`.
 *
 * Tất cả collections thuộc DB mặc định `megawin` (xem `WorkerCoreBaseRepo`).
 */
export const WorkerCoreCollections = {
  /** Distributed lock registry cho workers — xem `WorkerLockDoc`. */
  WorkerLocks: "worker_locks",
} as const;
