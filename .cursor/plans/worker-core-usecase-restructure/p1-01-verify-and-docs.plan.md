# P1-01 — Xoá alias + verify toàn repo + cập nhật docs

> **Status: ✅ done (03/08/2026)**
> Nguồn: `.cursor/plans/worker-core-usecase-restructure/00-overview.md`
> Phụ thuộc: p0-04 (mọi consumer đã chuyển canonical).

## 1. Điều kiện tiên quyết (gate)

Chỉ chạy khi grep các tên alias trong toàn repo (trừ `packages/worker-core/src/use-cases/index.ts` và `src/index.ts`) = **0 kết quả**:

- `BusinessLockCoordinator`
- `LockedWorkerUseCase`
- `TickLoopWorkerUseCase`
- `isLockedWorkerSkipped`
- `LockedWorkerResult` / `LockedWorkerSkipped` (nếu đã đổi type ở p0-02)

Nếu còn callsite → quay lại p0-04.

## 2. Xoá alias

- `use-cases/index.ts`: xoá block "Alias tạm".
- `src/index.ts`: xoá các alias tên cũ; giữ export canonical.
- Cân nhắc **giữ** `STALLED_ALERT_THRESHOLD` ở main barrel (BO dùng) — KHÔNG xoá.

## 3. Verify toàn repo

```
pnpm -w check-types        # hoặc turbo run check-types
```

Kỳ vọng xanh toàn bộ: worker-core, 7 game application, tenant-dispatch, worker-tenant-dispatch, backoffice.

## 4. Cập nhật tài liệu

- `packages/worker-core/package.json` description: cập nhật nếu cần nhắc subpath `/workers` `/locks`.
- Analysis `system-worker-health.analysis.md`: thêm mục ngắn "Tên class đã đổi 03/08" (bảng cũ→mới) để tránh nhầm khi đọc lại analysis nhắc `LockedWorkerUseCase`/`BusinessLockCoordinator`.
- Rule/analysis khác nhắc tên cũ: grep `.cursor/` cho 3 tên → cập nhật hoặc để lại ghi chú "đổi tên, xem overview" (KHÔNG bắt buộc sửa hết history plan cũ; chỉ sửa rule đang hiệu lực nếu có).
- Cập nhật bảng trạng thái `00-overview.md` → tất cả ✅ done.

## 5. Không làm

- KHÔNG đổi contract method subclass (`runLocked`/`runTick`/…).
- KHÔNG đổi `WorkerLockRepository` API.
- KHÔNG xoá subpath `/use-cases` hay `/use-cases/admin` (vẫn có consumer/tiện ích).

## Định nghĩa "done"

- 3 class mang tên mới, ở `use-cases/lock/`.
- `StalledItemTracker` tách riêng ở `use-cases/health/`, test-được độc lập.
- Import tường minh: `/workers` (extends) vs `/locks` (mutex).
- 0 alias còn lại; `check-types` toàn repo xanh; hành vi runtime không đổi.
