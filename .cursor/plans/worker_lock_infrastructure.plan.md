# Worker Lock Infrastructure Plan

> **Status**: Proposed. Chưa implement — dùng `reservedConcurrency: 1` ở Lambda
> làm biện pháp primary hiện tại. Plan này ghi lại giải pháp tổng quát để dùng
> chung cho mọi worker trong monorepo khi cần mutual exclusion mạnh hơn.

## 0. Mục tiêu

Cung cấp 1 mechanism **distributed lock** dùng MongoDB, shared library, có thể
reuse bởi:

- `apps/worker-tenant-dispatch` (main + retry lane) — tránh 2 invocation cùng
  xử lý 1 order khi `reservedConcurrency: 1` vẫn xảy ra (Lambda cold-start
  boundary, AWS bug hiếm).
- Các worker periodic khác trong tương lai (settle, publish, void, etc.).
- Any future Lambda cần "chỉ 1 instance được chạy trong 1 key namespace".

Không mục tiêu:

- Full-fledged distributed coordinator (Zookeeper/etcd).
- Fairness (first-come-first-serve giữa các waiters).
- High-throughput multi-owner locks (read-write lock).

---

## 1. Yêu cầu

1. **Mutual exclusion**: tại 1 thời điểm, tối đa 1 Lambda instance giữ lock cho
   1 `lockKey`.
2. **Auto-release**: lock có TTL — nếu holder crash, lock tự hết hạn sau
   `ttlSeconds`.
3. **Idempotent acquire**: gọi acquire với cùng `lockKey` + `ownerToken` nhiều
   lần → reentrant (cùng owner được gia hạn).
4. **Release chỉ bởi owner**: không cho worker khác release nhầm lock.
5. **Heartbeat** (optional): nếu run >> ttl, holder có thể gia hạn lock.
6. **Zero runtime dependency** ngoài MongoDB (không thêm Redis/DynamoDB).

---

## 2. Thiết kế

### 2.1. Collection schema

Collection mới trong DB `megawin` (hoặc DB chuyên infra): `worker_locks`.

```typescript
interface WorkerLockDoc {
  _id: unknown;
  /** Lock key — domain-specific, vd `"tenant-dispatch:main"`. Unique index. */
  lockKey: string;
  /** Token random per acquire — xác định owner. */
  ownerToken: string;
  /** Hết hạn; doc tự xoá bởi TTL index. */
  expiresAt: Date;
  acquiredAt: Date;
}
```

**Indexes:**

- `{ lockKey: 1 }` unique.
- `{ expiresAt: 1 }` TTL với `expireAfterSeconds: 0` — Mongo tự xoá document đã
  expire.

### 2.2. API

```typescript
export interface AcquireOptions {
  lockKey: string;
  /** Token đại diện owner — gen random/uuidv7 trong caller. */
  ownerToken: string;
  /** TTL giây cho lock. Should > worker timeout. */
  ttlSeconds: number;
}

export interface WorkerLockRepository {
  /**
   * Atomic acquire. Trả `true` nếu lấy được lock (hoặc reentrant với cùng owner).
   * `false` nếu đã có owner khác còn hiệu lực.
   */
  tryAcquire(opts: AcquireOptions): Promise<boolean>;

  /**
   * Gia hạn lock — chỉ thành công nếu lock còn hiệu lực và đúng owner.
   * Dùng khi worker dự kiến chạy dài hơn ttl ban đầu.
   */
  extend(lockKey: string, ownerToken: string, ttlSeconds: number): Promise<boolean>;

  /**
   * Release — chỉ xoá doc khi đúng owner. Trả `true` nếu released, `false`
   * nếu không phải owner hoặc đã expire.
   */
  release(lockKey: string, ownerToken: string): Promise<boolean>;
}
```

### 2.3. `tryAcquire` implementation (upsert atomic)

```typescript
async tryAcquire({ lockKey, ownerToken, ttlSeconds }: AcquireOptions): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  try {
    // Case A: lock chưa tồn tại → upsert tạo mới.
    // Case B: lock đã tồn tại & cùng owner → update expiresAt (reentrant / heartbeat).
    // Case C: lock đã tồn tại & khác owner & còn hiệu lực → filter không match → fail (duplicate key).
    // Case D: lock đã tồn tại nhưng expired → TTL đã xoá hoặc caller cũ chết;
    //         filter `expiresAt <= now` cho phép takeover bằng findOneAndUpdate.
    const result = await this._collection.findOneAndUpdate(
      {
        lockKey,
        $or: [
          { ownerToken }, // reentrant
          { expiresAt: { $lte: now } }, // stale → takeover
        ],
      },
      {
        $set: { ownerToken, expiresAt, acquiredAt: now },
      },
      { upsert: true, returnDocument: "after" },
    );
    return !!result;
  } catch (err: any) {
    if (err?.code === 11000) {
      // Duplicate key: lock tồn tại với owner khác + chưa expire → fail bình thường.
      return false;
    }
    throw err;
  }
}
```

Lưu ý: upsert + filter match là pattern chuẩn MongoDB cho atomic acquire. Tham
khảo `packages/tenant-gateway/src/transaction/...` đã có pattern tương tự.

### 2.4. `release` implementation

```typescript
async release(lockKey: string, ownerToken: string): Promise<boolean> {
  const result = await this._collection.deleteOne({ lockKey, ownerToken });
  return result.deletedCount === 1;
}
```

### 2.5. `extend` implementation

```typescript
async extend(lockKey: string, ownerToken: string, ttlSeconds: number): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
  const result = await this._collection.updateOne(
    { lockKey, ownerToken, expiresAt: { $gt: now } },
    { $set: { expiresAt } },
  );
  return result.modifiedCount === 1;
}
```

---

## 3. Package placement

Tạo package mới: `packages/worker-lock`.

```
packages/worker-lock/
├── package.json
├── tsconfig.json
├── tsconfig.build.json
└── src/
    ├── index.ts
    ├── entities/
    │   └── worker-lock.ts      # WorkerLockDoc
    ├── infras/
    │   ├── base-repo.ts        # trỏ DB megawin-infra hoặc megawin
    │   └── worker-lock-repo.ts # tryAcquire/extend/release
    └── utils/
        └── with-lock.ts        # helper composable
```

### 3.1. Exports

```typescript
export { WorkerLockRepository } from "./infras/worker-lock-repo";
export { withLock } from "./utils/with-lock";
export type { AcquireOptions } from "./infras/worker-lock-repo";
```

### 3.2. `withLock` helper

```typescript
export async function withLock<T>(
  lockKey: string,
  ttlSeconds: number,
  fn: (ctx: { heartbeat: () => Promise<boolean> }) => Promise<T>,
): Promise<T | null> {
  const repo = new WorkerLockRepository();
  const ownerToken = crypto.randomUUID();

  const acquired = await repo.tryAcquire({ lockKey, ownerToken, ttlSeconds });
  if (!acquired) {
    console.warn(`[worker-lock] skipped — already held: ${lockKey}`);
    return null;
  }

  try {
    return await fn({
      heartbeat: () => repo.extend(lockKey, ownerToken, ttlSeconds),
    });
  } finally {
    await repo.release(lockKey, ownerToken);
  }
}
```

---

## 4. Usage ví dụ — tenant-dispatch

```typescript
// apps/worker-tenant-dispatch/src/handlers/dispatch/process-batch.ts
import { withLock } from "@megawin/worker-lock";
import { ProcessMainDispatchBatchUseCase } from "@megawin/tenant-dispatch/use-cases/process";

const useCase = new ProcessMainDispatchBatchUseCase();

export async function handler() {
  const result = await withLock("tenant-dispatch:main", 90, async () => {
    return await useCase.run();
  });

  if (result === null) {
    console.info("[tenant-dispatch] main skipped — previous run still holding lock");
    return { skipped: true };
  }

  console.info(`[tenant-dispatch] ${JSON.stringify(result)}`);
  return result;
}
```

Tương tự cho retry lane: `lockKey = "tenant-dispatch:retry"`, `ttl = 330` (> 300s timeout + buffer).

---

## 5. Hybrid strategy: reservedConcurrency vs distributed lock

| Lớp                       | Phạm vi bảo vệ                                               | Chi phí    |
| ------------------------- | ------------------------------------------------------------ | ---------- |
| `reservedConcurrency: 1`  | 1 AWS account, 1 Lambda function. Không chống race boundary. | Free       |
| `worker-lock` + withLock  | Distributed, cross-region, cross-function.                   | +1 RT Mongo per invocation |

**Khuyến nghị**: layer cả 2. `reservedConcurrency` là line of defense #1 (miễn
phí, cover 99% cases). `worker-lock` là line #2 cho strict correctness.

---

## 6. Edge cases

| Case                                                        | Xử lý                                                                                              |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Lambda A acquire, crash trước khi release                   | TTL expire → Lambda B tiếp theo takeover. Đảm bảo `ttl > worker runtime`.                          |
| Lambda A heartbeat fail (lock expired từ lâu)               | `extend` trả `false` → A nên abort công việc để B không collide. Use case tự quyết action.         |
| Clock skew giữa Lambda & Mongo                              | Mongo TTL dựa `expiresAt` server-side → an toàn khi Lambda slew time. `new Date()` nên dùng caller client đủ chính xác. |
| Hai Lambda cùng gọi `tryAcquire` đúng thời điểm TTL expire  | MongoDB `findOneAndUpdate` atomic — chỉ 1 bên thắng upsert, bên kia bị duplicate key → fail gracefully. |
| Lock doc bị xoá tay (ops)                                   | Lần acquire tiếp theo tạo mới — không crash, không corruption (lock chỉ là synchronization primitive). |

---

## 7. Testing plan

- Unit: `WorkerLockRepository` với mongodb-memory-server.
  - `tryAcquire` thành công khi không có lock.
  - `tryAcquire` fail khi lock đã hold bởi owner khác.
  - `tryAcquire` reentrant với cùng owner.
  - `tryAcquire` takeover khi lock expired.
  - `release` chỉ work với đúng owner.
  - `extend` chỉ work khi lock còn hiệu lực + đúng owner.
- Integration: 2 Node process cùng call `withLock` trên cùng `lockKey` → chỉ 1 bên fn() chạy.
- Race test: 10 process đồng thời → đúng 1 thắng, 9 return null.

---

## 8. Deployment

1. Tạo package `@megawin/worker-lock` + publish workspace.
2. Add TTL index migration:
   ```javascript
   db.worker_locks.createIndex({ lockKey: 1 }, { unique: true });
   db.worker_locks.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
   ```
3. Adopt gradual: `worker-tenant-dispatch` trước (2 lane), sau đó các worker khác.

---

## 9. Alternatives đã cân nhắc

| Option                                   | Lý do loại                                                                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| DynamoDB conditional writes              | Thêm service. Mongo đã có.                                                                                                 |
| Redis/ElastiCache                        | Thêm service. Ops burden.                                                                                                  |
| AWS Step Functions Distributed Map       | Over-engineering cho scheduled Lambda đơn giản.                                                                            |
| Chỉ dùng `reservedConcurrency: 1`        | Primary hiện tại. Nhưng có edge case (warm-pool boundary) — có khi 2 invocation overlap ngắn. Distributed lock đóng gap này. |

---

## 10. Acceptance criteria

- [ ] Package `@megawin/worker-lock` được publish workspace.
- [ ] `withLock` helper test pass.
- [ ] TTL index được tạo trên `worker_locks` trong env dev + staging.
- [ ] Adopt ở worker-tenant-dispatch (main + retry).
- [ ] Khi chạy 2 Lambda invocation chồng nhau → 1 bên `skipped: true` trong log.

---

## 11. Không-scope

- Fairness / queue waiter. Lambda scheduled trigger không cần — next tick sẽ thử lại.
- Lock release trên SIGTERM graceful (Lambda KHÔNG gửi SIGTERM trước timeout;
  dựa TTL là đủ).
- Metrics custom — có thể add sau (`lock_acquire_success`, `lock_takeover_stale`).
