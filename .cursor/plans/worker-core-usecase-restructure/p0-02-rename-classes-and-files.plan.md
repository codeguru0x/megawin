# P0-02 — Đổi tên 3 class + file + JSDoc + type union

> Nguồn: `.cursor/plans/worker-core-usecase-restructure/00-overview.md`
> Phụ thuộc: p0-01 (nên xong trước để file `locked-worker-use-case.ts` đã gọn).

## Đổi tên

| Cũ | Mới | File cũ → mới |
|---|---|---|
| `LockedWorkerUseCase` | `SingleRunWorker` | `locked-worker-use-case.ts` → `lock/single-run-worker.ts` |
| `TickLoopWorkerUseCase` | `TickLoopWorker` | `tick-loop-worker-use-case.ts` → `lock/tick-loop-worker.ts` |
| `BusinessLockCoordinator` | `DistributedMutex` | `business-lock-coordinator.ts` → `lock/distributed-mutex.ts` |

Cấu trúc thư mục đích:

```
use-cases/
├── lock/
│   ├── single-run-worker.ts
│   ├── tick-loop-worker.ts
│   └── distributed-mutex.ts
├── health/
│   └── stalled-item-tracker.ts   (từ p0-01)
├── admin/                         (giữ nguyên)
├── types.ts                       (giữ; xem đổi tên type bên dưới)
└── index.ts
```

## Đổi tên type liên quan (đồng bộ semantic)

Trong `types.ts` — cân nhắc đổi để khớp `SingleRunWorker`, nhưng **giữ alias** để không phá `isLockedWorkerSkipped` (BO + tenant-dispatch handler dùng):

| Cũ | Mới | Alias giữ lại? |
|---|---|---|
| `LockedWorkerResult<O>` | `WorkerRunResult<O>` | có, `export type LockedWorkerResult = WorkerRunResult` |
| `LockedWorkerSkipped` | `WorkerRunSkipped` | có |
| `isLockedWorkerSkipped` | `isWorkerRunSkipped` | có, `export const isLockedWorkerSkipped = isWorkerRunSkipped` |

> Alias xoá ở p1-01 sau khi consumer chuyển. Nếu muốn giảm churn, có thể **giữ tên type cũ** (`LockedWorkerResult`) vì "Locked" ở đây mô tả kết quả có-thể-bị-skip-do-locked, không quá sai. Quyết định lúc review — mặc định plan: đổi + alias.

## Cập nhật interne worker-core

- `distributed-mutex.ts`: đổi tên class + JSDoc; `@link LockedWorkerUseCase` → `@link SingleRunWorker`.
- `single-run-worker.ts`: JSDoc `TickLoopWorkerUseCase` → `TickLoopWorker`, `BusinessLockCoordinator` → `DistributedMutex`.
- `tick-loop-worker.ts`: `extends LockedWorkerUseCase` → `extends SingleRunWorker`; import path đổi; JSDoc.
- JSDoc trong `worker-lock-repo.ts`, `worker-lock.ts` (entity), `worker-lock.types.ts`, `indexes/index.ts`: cập nhật mọi mention tên class cũ. **Chỉ sửa comment**, không đổi code.

## Quy tắc giữ hành vi

- Chữ ký generic `<I, O>` không đổi.
- `protected readonly ttlSeconds`, `resolveLockKey`, `runLocked`, `beforeLoop`, `runTick`, `resolveTickMs`, `buildResult` — giữ nguyên tên (đây là contract subclass, KHÔNG đổi ở plan này).
- `acquire`/`release`/`releaseOnRollback` của mutex — giữ nguyên tên method + `AcquireBusinessLockOptions`/`ReleaseBusinessLockOptions` (đổi tên options type là churn thừa; giữ, có thể rename ở đợt sau nếu muốn).

## Kiểm tra

- `pnpm --filter @megawin/worker-core check-types` (nội bộ package xanh trước khi đụng barrel/consumer).
- Grep tên file cũ trong `src/use-cases/` = 0.
