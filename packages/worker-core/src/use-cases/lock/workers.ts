/**
 * Barrel cho consumer **`extends`** base worker class — dùng qua subpath
 * `@megawin/worker-core/workers`.
 *
 * Đối lập với `@megawin/worker-core/locks` (facade để `new` — mutex cross-process).
 */

export { STALLED_ALERT_THRESHOLD } from "../health/stalled-item-tracker";
export type { TickLoopResult, TickOutcome, WorkerRunResult, WorkerRunSkipped } from "../types";
export { isWorkerRunSkipped } from "../types";
export { LockTakenOverError } from "./lock-taken-over-error";
export { SingleRunWorker } from "./single-run-worker";
export { TickLoopWorker } from "./tick-loop-worker";
