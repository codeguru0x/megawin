# P0-03 — Phân tầng export subpath

> Nguồn: `.cursor/plans/worker-core-usecase-restructure/00-overview.md`
> Phụ thuộc: p0-02 (tên/file mới đã sẵn).

## Mục tiêu

Làm "cách dùng" tường minh qua **đường import**:
- `@megawin/worker-core/workers` → base class để **`extends`** (`SingleRunWorker`, `TickLoopWorker`) + types worker-run/tick.
- `@megawin/worker-core/locks` → facade để **`new`** (`DistributedMutex`) + options types.
- `@megawin/worker-core` (main) → giữ mọi export cũ (back-compat) + re-export tiện.
- `@megawin/worker-core/use-cases` → GIỮ (consumer hiện dùng); re-export từ `lock/*`.
- `@megawin/worker-core/use-cases/admin` → GIỮ nguyên.

## `package.json` exports — thêm 2 subpath

```jsonc
"./workers": {
  "types": "./src/use-cases/lock/workers.ts",
  "import": "./src/use-cases/lock/workers.ts",
  "default": "./dist/use-cases/lock/workers.js"
},
"./locks": {
  "types": "./src/use-cases/lock/locks.ts",
  "import": "./src/use-cases/lock/locks.ts",
  "default": "./dist/use-cases/lock/locks.js"
}
```

## File barrel mới

`src/use-cases/lock/workers.ts`:
```ts
export { SingleRunWorker } from "./single-run-worker";
export { TickLoopWorker } from "./tick-loop-worker";
export { STALLED_ALERT_THRESHOLD } from "../health/stalled-item-tracker";
export { isWorkerRunSkipped } from "../types";
export type { WorkerRunResult, WorkerRunSkipped, TickLoopResult, TickOutcome } from "../types";
```

`src/use-cases/lock/locks.ts`:
```ts
export { DistributedMutex } from "./distributed-mutex";
export type { AcquireBusinessLockOptions, ReleaseBusinessLockOptions } from "./distributed-mutex";
```

## Cập nhật `use-cases/index.ts` (giữ back-compat + alias)

```ts
// Canonical
export { SingleRunWorker } from "./lock/single-run-worker";
export { TickLoopWorker } from "./lock/tick-loop-worker";
export { DistributedMutex } from "./lock/distributed-mutex";
export { STALLED_ALERT_THRESHOLD } from "./health/stalled-item-tracker";
export { isWorkerRunSkipped } from "./types";
export type { WorkerRunResult, WorkerRunSkipped, TickLoopResult, TickOutcome } from "./types";

// Alias tạm — xoá ở p1-01 sau khi consumer chuyển hết
export { SingleRunWorker as LockedWorkerUseCase } from "./lock/single-run-worker";
export { TickLoopWorker as TickLoopWorkerUseCase } from "./lock/tick-loop-worker";
export { DistributedMutex as BusinessLockCoordinator } from "./lock/distributed-mutex";
export { isWorkerRunSkipped as isLockedWorkerSkipped } from "./types";
export type { WorkerRunResult as LockedWorkerResult, WorkerRunSkipped as LockedWorkerSkipped } from "./types";
```

## Cập nhật `src/index.ts` (main barrel)

Mirror alias tương tự (giữ `BusinessLockCoordinator`, `LockedWorkerUseCase`, `isLockedWorkerSkipped`, `STALLED_ALERT_THRESHOLD` cho BO + resettle consumers hiện tại). Thêm export canonical mới.

## Kiểm tra

- `pnpm --filter @megawin/worker-core check-types`.
- Verify subpath resolve: import thử `@megawin/worker-core/workers` + `/locks` trong 1 file scratch (rồi xoá) hoặc dựa vào consumer ở p0-04.
- **KHÔNG** xoá alias ở bước này — build phải xanh với consumer chưa đổi.
