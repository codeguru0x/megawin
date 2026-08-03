# Worker-Core — Tái cấu trúc 3 Use Case Lock/Worker (Overview)

> **Nguồn:** phân tích trực tiếp 3 file `packages/worker-core/src/use-cases/{business-lock-coordinator,locked-worker-use-case,tick-loop-worker-use-case}.ts` (03/08/2026) + toàn bộ callsite trong repo.
> **Status:** `done` — đã thực thi + verify toàn repo xanh (03/08/2026).

## 1. Vấn đề (tóm tắt phân tích)

`worker-core` có 3 abstraction ngồi trên cùng hạ tầng `worker_locks` + `WorkerLockRepository`, nhưng **tên gọi + tổ chức không phản ánh cách dùng**, và 1 trong 3 gánh quá nhiều concern:

| File hiện tại | Bản chất | Cách consumer dùng | Vấn đề |
|---|---|---|---|
| `BusinessLockCoordinator` | Facade mutex cross-process | `new` + `acquire/release` | Tên "Coordinator/Business" hẹp; thực chất là distributed mutex |
| `LockedWorkerUseCase` | Base class single-invocation | `extends` | **God class**: trộn 5 concern (lock + kill-switch + cursor + heartbeat + stalled-items). Hậu tố `UseCase` gây nhầm với họ `InternalUseCase.run()` |
| `TickLoopWorkerUseCase` | Base class loop tick | `extends` | Đúng scope; chỉ vướng hậu tố `UseCase` + machinery stalled-items nằm ở class cha |

**Mục tiêu:** (A) đổi tên phản ánh vai trò, (B) tách `StalledItemTracker` bằng composition (không phá API subclass), (C) phân tầng export subpath để "extends worker" vs "new mutex" tường minh qua đường import.

## 2. Quyết định đã chốt (từ user)

- **Đổi tên cả 3:**
  - `LockedWorkerUseCase` → `SingleRunWorker`
  - `TickLoopWorkerUseCase` → `TickLoopWorker`
  - `BusinessLockCoordinator` → `DistributedMutex`
- Tách `StalledItemTracker` bằng **composition** (subclass API `recordStalledItem`/`clearStalledItem` giữ nguyên).
- Phân tầng subpath export.

## 3. Ranh giới — KHÔNG đụng

- **KHÔNG** tách `kind: business`/`worker` ra 2 collection (analysis `system-worker-health` §2.4 đã chốt dùng chung + TTL `partialFilterExpression`).
- **KHÔNG** đổi logic `tryAcquire`/`finalizeAndRelease`/`saveCursor` trong `WorkerLockRepository`.
- **KHÔNG** đổi contract tri-state `setCursor` (undefined/null/string) — chỉ di chuyển, không sửa hành vi.
- **KHÔNG** đổi `WorkerLockKind`, `WorkerStalledItem`, `WorkerLockDoc` entity shape.
- **KHÔNG** đổi hành vi runtime của bất kỳ worker nào — đây là refactor thuần tên + tổ chức + composition.

## 4. Bản đồ callsite (khảo sát 03/08/2026)

### `BusinessLockCoordinator` (14 callsite — `new` + import)
- `trigger-resettle.ts` × 7 game (keno, lotto535, mega645, power655, max3d, max3dpro, bingo18)
- `finalize-settle.ts` × 4 game có resettle (keno, max3d, max3dpro, bingo18) — mega645/power655/lotto535 kiểm tra lại trong plan
- JSDoc tham chiếu: `settle/types.ts` × 3, `game-core/src/utils/resettle-keys.ts`
- Import path: **tất cả dùng `@megawin/worker-core`** (main barrel)

### `LockedWorkerUseCase` (extends trực tiếp — 4 callsite)
- `game-bingo18-application/.../operations/sync-betting-stats.ts`
- `game-max3d-application/.../operations/sync-betting-stats.ts`
- `game-max3dpro-application/.../operations/sync-betting-stats.ts`
- `tenant-dispatch/.../process/process-dispatch-batch.ts` (`ProcessDispatchBatchBaseUseCase`)
- Import path: **`@megawin/worker-core/use-cases`**

### `TickLoopWorkerUseCase` (extends — 2 callsite)
- `game-keno-application/.../operations/sync-betting-stats.ts`
- `game-keno-application/.../operations/evaluate-ops-alerts.ts`
- Import path: **`@megawin/worker-core/use-cases`**

### `STALLED_ALERT_THRESHOLD` (BO UI — 2 callsite)
- `apps/backoffice/.../system/workers/_components/workers-table.tsx`
- `apps/backoffice/.../system/workers/_components/stalled-items-dialog.tsx`
- Import path: **`@megawin/worker-core`** (main barrel)

### `isLockedWorkerSkipped` (2 callsite)
- `apps/worker-tenant-dispatch/.../dispatch/{process-batch,process-retry-batch}.ts`
- Import path: **`@megawin/worker-core`** (main barrel)

### Subpath `@megawin/worker-core/use-cases/admin`
- `stalled-items-dialog.tsx` import `WorkerHealthRow` — GIỮ nguyên.

## 5. Bảng trạng thái

| Plan | Phase | Status | Ghi chú |
|---|---|---|---|
| p0-01-extract-stalled-tracker | P0 | ✅ done | Composition, API subclass không đổi |
| p0-02-rename-classes-and-files | P0 | ✅ done | 3 class + file + JSDoc + type union |
| p0-03-tiered-exports | P0 | ✅ done | subpath `/workers`, `/locks`; giữ back-compat |
| p0-04-update-consumers | P0 | ✅ done | 7 game + tenant-dispatch + BO import |
| p1-01-verify-and-docs | P1 | ✅ done | Alias đã xoá; `pnpm turbo run check-types` 44/44 pass; docs (package.json description + 7 analysis + rule) đã cập nhật |

## 6. Thứ tự phụ thuộc

```
p0-01 (tách tracker) ─┐
                      ├─→ p0-02 (rename) ─→ p0-03 (exports) ─→ p0-04 (consumers) ─→ p1-01 (verify)
```

p0-01 độc lập, nên làm trước (không phá API). p0-02→p0-04 phải theo thứ tự (rename trước, export sau, consumer cuối). p1-01 chốt.

## 7. Chiến lược back-compat (giảm rủi ro)

Để tránh 1 commit khổng lồ phá build, plan dùng **alias tạm** trong barrel:

```ts
// use-cases/index.ts — giai đoạn chuyển tiếp
export { SingleRunWorker, SingleRunWorker as LockedWorkerUseCase } from "./lock/single-run-worker";
```

Alias `LockedWorkerUseCase`/`TickLoopWorkerUseCase`/`BusinessLockCoordinator` giữ đến khi p0-04 cập nhật hết consumer, rồi **p1-01 xoá alias**. Cho phép build xanh giữa các bước.
