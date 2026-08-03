/**
 * Barrel cho consumer **`extends`** base worker class — dùng qua subpath
 * `@megawin/worker-core/workers`.
 *
 * Đối lập với `@megawin/worker-core/locks` (facade để `new` — mutex cross-process).
 */
export { SingleRunWorker } from "./single-run-worker";
export { TickLoopWorker } from "./tick-loop-worker";
export { LockTakenOverError } from "./lock-taken-over-error";
export { STALLED_ALERT_THRESHOLD } from "../health/stalled-item-tracker";
export { isWorkerRunSkipped } from "../types";
export type { WorkerRunResult, WorkerRunSkipped, TickLoopResult, TickOutcome } from "../types";
