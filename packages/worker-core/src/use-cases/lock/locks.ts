/**
 * Barrel cho consumer **`new`** mutex facade — dùng qua subpath
 * `@megawin/worker-core/locks`.
 *
 * Đối lập với `@megawin/worker-core/workers` (base class để `extends`).
 */

export type { AcquireBusinessLockOptions, ReleaseBusinessLockOptions } from "./distributed-mutex";
export { DistributedMutex } from "./distributed-mutex";
