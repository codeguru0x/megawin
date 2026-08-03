# P0-04 — Cập nhật consumer sang tên + subpath mới

> Nguồn: `.cursor/plans/worker-core-usecase-restructure/00-overview.md`
> Phụ thuộc: p0-03 (subpath + alias sẵn sàng).

## Nguyên tắc

Đổi từng consumer sang **tên canonical + subpath ngữ nghĩa**. Vì alias còn sống (p0-03), có thể đổi từng file, build luôn xanh giữa chừng.

## 1. Base-class consumers → `@megawin/worker-core/workers`

| File | Đổi |
|---|---|
| `game-keno-application/.../operations/sync-betting-stats.ts` | `TickLoopWorkerUseCase` → `TickLoopWorker`; import `@megawin/worker-core/workers`; type `TickLoopResult/TickOutcome` cùng subpath; JSDoc `@link` |
| `game-keno-application/.../operations/evaluate-ops-alerts.ts` | như trên |
| `game-bingo18-application/.../operations/sync-betting-stats.ts` | `LockedWorkerUseCase` → `SingleRunWorker`; import `/workers` |
| `game-max3d-application/.../operations/sync-betting-stats.ts` | như trên |
| `game-max3dpro-application/.../operations/sync-betting-stats.ts` | như trên |
| `tenant-dispatch/.../process/process-dispatch-batch.ts` | `LockedWorkerUseCase` → `SingleRunWorker`; import `/workers` |

Lưu ý JSDoc trong các file này nhắc `recordStalledItem`/`clearStalledItem` "của `LockedWorkerUseCase`" → đổi thành `SingleRunWorker`.

## 2. Mutex consumers → `@megawin/worker-core/locks`

| File | Đổi |
|---|---|
| `trigger-resettle.ts` × 7 game | `BusinessLockCoordinator` → `DistributedMutex`; import `@megawin/worker-core/locks`; field `lockCoordinator` có thể giữ tên biến (tùy chọn, không bắt buộc) |
| `finalize-settle.ts` × game có resettle | như trên |
| JSDoc: `settle/types.ts` × 3, `game-core/src/utils/resettle-keys.ts` | đổi mention `BusinessLockCoordinator` → `DistributedMutex` (chỉ comment) |

> **Xác nhận trong plan**: grep lại `finalize-settle` mỗi game để biết game nào thực sự import mutex (keno, max3d, max3dpro, bingo18 chắc chắn; kiểm mega645/power655/lotto535).

## 3. Skip-guard consumers → `@megawin/worker-core/workers`

| File | Đổi |
|---|---|
| `apps/worker-tenant-dispatch/.../dispatch/process-batch.ts` | `isLockedWorkerSkipped` → `isWorkerRunSkipped`; import `/workers` |
| `apps/worker-tenant-dispatch/.../dispatch/process-retry-batch.ts` | như trên |

## 4. BO UI — giữ main barrel

| File | Đổi |
|---|---|
| `system/workers/_components/workers-table.tsx` | `STALLED_ALERT_THRESHOLD` — có thể chuyển sang `/workers` hoặc giữ main barrel. **Giữ main barrel** (ít churn). |
| `system/workers/_components/stalled-items-dialog.tsx` | như trên; `WorkerHealthRow` giữ `@megawin/worker-core/use-cases/admin` |

## Kiểm tra sau mỗi nhóm

- `pnpm --filter <package> check-types` cho package vừa đổi.
- Sau khi xong hết: `pnpm --filter @megawin/game-keno-application --filter @megawin/game-bingo18-application ... check-types` (7 game + tenant-dispatch + backoffice).
- Grep alias cũ trong `apps/` + `packages/` (trừ `worker-core`) = kỳ vọng 0 (mọi consumer đã chuyển). Nếu còn → đổi nốt trước p1-01.
