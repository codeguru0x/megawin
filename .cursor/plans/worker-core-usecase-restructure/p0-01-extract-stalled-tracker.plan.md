# P0-01 — Tách `StalledItemTracker` bằng composition

> Nguồn: `.cursor/plans/worker-core-usecase-restructure/00-overview.md`
> Phụ thuộc: không (độc lập, làm trước). API subclass KHÔNG đổi.

## Mục tiêu

Rút ~110 dòng observability (stalled-item tracking) khỏi `LockedWorkerUseCase` ra 1 class riêng, ghép lại bằng composition. Sau bước này `LockedWorkerUseCase` (chưa đổi tên ở plan này) chỉ còn concern lock thuần + cursor + kill-switch.

## Vì sao composition, không mixin/inheritance

- TS single-inheritance: `TickLoopWorkerUseCase extends LockedWorkerUseCase` đã chiếm chỗ.
- Stalled-items là **observability**, không phải "lock" — không nên nằm trong chuỗi kế thừa lock.
- Composition cho phép **unit-test tracker độc lập** (Map + evict + cap) mà không cần dựng lock/Mongo.

## File mới

`packages/worker-core/src/use-cases/health/stalled-item-tracker.ts`

```ts
import { truncateErrorMessage } from "@megawin/shared/utils";
import type { WorkerStalledItem } from "../../entities";

/**
 * Trần số item giữ trong Map RAM VÀ persist vào `stalledItems`. (JSDoc bê nguyên từ
 * MAX_STALLED_ITEMS hiện tại — giữ đầy đủ lý do 12KB/cap=20, evict, safety-net slice.)
 */
const MAX_STALLED_ITEMS = 20;

/** Ngưỡng `failCount` mặc định để BO coi item "đáng chú ý". (JSDoc bê nguyên.) */
export const STALLED_ALERT_THRESHOLD = 3;

/**
 * Theo dõi streak lỗi per-item trong 1 invocation, merge với `stalledItems` đọc từ DB.
 * KHÔNG I/O — chỉ đụng RAM; owner (SingleRunWorker) flush 1 lần trong finalizeAndRelease.
 */
export class StalledItemTracker {
  private items = new Map<string, WorkerStalledItem>();

  /** Seed từ DB lúc acquire — tích luỹ failCount qua invocation. */
  seed(existing: WorkerStalledItem[]): void { /* for…set */ }

  /** = recordStalledItem hiện tại (gồm evictLowestFailCount khi Map đầy). */
  record(itemKey: string, error: unknown): void { /* … */ }

  /** = clearStalledItem hiện tại. */
  clear(itemKey: string): void { this.items.delete(itemKey); }

  /** Snapshot top-N theo failCount desc, cap MAX_STALLED_ITEMS — dùng ở finalize. */
  snapshot(): WorkerStalledItem[] {
    return [...this.items.values()]
      .toSorted((a, b) => b.failCount - a.failCount)
      .slice(0, MAX_STALLED_ITEMS);
  }

  private evictLowestFailCount(): void { /* bê nguyên */ }
}
```

## Sửa `locked-worker-use-case.ts`

1. Xoá: `MAX_STALLED_ITEMS`, `STALLED_ALERT_THRESHOLD`, `_stalledItems`, `recordStalledItem`, `evictLowestFailCount`, `clearStalledItem` (phần thân).
2. Thêm field `private readonly stalledTracker = new StalledItemTracker();`
3. Giữ **cùng chữ ký protected** để subclass không đổi — delegate:

```ts
protected recordStalledItem(itemKey: string, error: unknown): void {
  this.stalledTracker.record(itemKey, error);
}
protected clearStalledItem(itemKey: string): void {
  this.stalledTracker.clear(itemKey);
}
```

4. `execute()`:
   - Bước seed: thay vòng `for … this._stalledItems.set(...)` bằng `this.stalledTracker = new StalledItemTracker(); this.stalledTracker.seed(existing.stalledItems)` (reset per-invocation — Lambda container reuse). Lưu ý: field `readonly` → đổi thành non-readonly hoặc thêm method `reset()` trên tracker. **Chọn `reset()`** để giữ `readonly`.
   - `finalizeAndRelease` payload: `stalledItems: this.stalledTracker.snapshot()`.

5. Re-export `STALLED_ALERT_THRESHOLD` từ `locked-worker-use-case.ts` (back-compat cho barrel):
   ```ts
   export { STALLED_ALERT_THRESHOLD } from "./health/stalled-item-tracker";
   ```

## Kiểm tra

- `pnpm --filter @megawin/worker-core check-types`.
- Grep `_stalledItems` = 0 kết quả sau sửa.
- API subclass: `recordStalledItem`/`clearStalledItem` chữ ký y hệt → 8 worker không đổi.
- Barrel `worker-core/src/index.ts` vẫn export `STALLED_ALERT_THRESHOLD` → BO UI không đổi.

## Rủi ro & mitigations

- **Reset per-invocation**: hiện `execute` khởi tạo `this._stalledItems = new Map()` đầu hàm. Tracker phải có `reset()` gọi ở đúng vị trí đó, TRƯỚC `seed`. Nếu quên → streak rò rỉ giữa invocation (container reuse). Test: chạy 2 lần execute giả lập cùng instance, assert Map rỗng đầu lần 2 trước seed.
