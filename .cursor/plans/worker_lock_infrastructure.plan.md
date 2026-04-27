---
name: ""
overview: ""
todos: []
isProject: false
---

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

## Design Decisions (đã thảo luận)

### DD-1: Package placement → `@megawin/worker-core`

Không dùng tên `worker-lock` (quá hẹp) và không nhét vào `app-core` (không có
MongoDB, sẽ làm nặng consumers chỉ dùng `aws/` hoặc `use-cases/`).

Tạo package mới `@megawin/worker-core` — tên nhất quán với pattern `*-core` đã
có trong codebase (`game-core`, `app-core`). Đủ rộng để chứa các worker utilities
tương lai (metrics, heartbeat helpers, v.v.) mà không cần tạo thêm package.

### DD-2: Trạng thái enable/disable → `isEnabled: boolean`

Tên `active` dễ nhầm với "lock đang active". Dùng `isEnabled: boolean` — rõ
ràng đây là configuration flag, không phải runtime state. Default `true`.

### DD-3: Execution metadata → `WorkerRunMeta` tối giản (3 fields)

Chỉ giữ fields có giá trị thực sự:

| Field | Giữ? | Lý do |
| --- | --- | --- |
| `version` | Bỏ | Env var, tìm trong CloudWatch log dễ hơn |
| `invocationId` | Bỏ | CloudWatch request ID, không cần persist vào DB |
| `cursor` | **Giữ** | Checkpoint để resume sau crash — giá trị business thực sự |
| `processedCount` | Bỏ | Metrics, không phải checkpoint |
| `lastSuccessAt` | **Giữ** | Ops detect stuck worker — "lần cuối thành công khi nào?" |
| `lastFailedAt` | Bỏ | Dư thừa — `lastError` đã đủ để biết có lỗi hay không |
| `lastError` | **Giữ** | Debug khi worker lỗi liên tục; cleared về `undefined` khi success |

**Về `cursor` type**: dùng `string`, không dùng `bigint`/`Long`. MongoDB BSON Long
không serialize được qua JSON an toàn — codebase đã có pattern `longToString()` để
convert trước khi lưu. Worker nào dùng Long sequence number (VD: change stream
lastVersion) sẽ `.toString()` trước khi ghi vào cursor, và `Long.fromString()`
khi đọc lại.

### DD-4: `WorkerLockEntity` — Omit `_id`, thêm `id: string`

Theo pattern chuẩn của codebase: `Doc` là MongoDB raw shape, `Entity` là domain
model với `id: string` (ObjectId.toString()). Mapper convert giữa hai layer.

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
7. **Kill-switch**: ops có thể disable 1 worker cụ thể bằng cách set
  `isEnabled: false` trực tiếp trên DB mà không cần deploy lại.

---

## 2. Thiết kế

### 2.1. Collection schema

Collection mới trong DB `megawin`: `worker_locks`.

```typescript
// ── packages/worker-core/src/entities/worker-lock.ts ─────────────────────

import type { ObjectId } from "mongodb";

/**
 * Execution metadata tối giản — ghi lại checkpoint và trạng thái lần chạy cuối.
 *
 * Ghi bởi `withLock` tự động (`lastSuccessAt`, `lastError`).
 * Ghi bởi worker thủ công qua `updateMeta()` khi cần persist checkpoint (`cursor`).
 */
export interface WorkerRunMeta {
  /**
   * Opaque checkpoint cursor — worker tự encode format, `string` luôn.
   *
   * Worker dùng Long/bigint sequence number phải convert trước khi ghi:
   * - Ghi: `Long.fromNumber(n).toString()`
   * - Đọc lại: `Long.fromString(cursor)`
   *
   * VD: change stream version `"9007199254740993"`, ISO timestamp `"2026-04-27T10:00:00Z"`.
   */
  cursor?: string;
  /**
   * ISO 8601 timestamp lần chạy cuối thành công.
   * Dùng bởi ops để detect stuck worker ("lần cuối thành công khi nào?").
   * Set tự động bởi `withLock` sau khi fn() hoàn thành không lỗi.
   */
  lastSuccessAt?: string;
  /**
   * Error message ngắn gọn từ lần chạy cuối thất bại.
   * Set tự động bởi `withLock` khi fn() throw.
   * Cleared về `undefined` khi fn() thành công — luôn phản ánh trạng thái hiện tại.
   */
  lastError?: string;
}

/**
 * MongoDB document shape cho collection `worker_locks`.
 * Không dùng trực tiếp trong business logic — dùng `WorkerLockEntity`.
 */
export interface WorkerLockDoc {
  _id: ObjectId;
  /** Lock key — domain-specific. VD: `"tenant-dispatch:main"`. Unique index. */
  lockKey: string;
  /** Token random per acquire — xác định owner duy nhất. */
  ownerToken: string;
  /** Hết hạn; doc tự xoá bởi MongoDB TTL index (`expireAfterSeconds: 0`). */
  expiresAt: Date;
  /** Thời điểm acquire thành công lần gần nhất. */
  acquiredAt: Date;
  /**
   * Kill-switch — khi `false`, `withLock` sẽ skip worker hoàn toàn.
   * Ops set trực tiếp trên DB để disable worker không cần deploy lại.
   * Default: `true`.
   */
  isEnabled: boolean;
  /**
   * Execution metadata từ lần chạy cuối. Partial update — không overwrite
   * toàn bộ khi chỉ cần update 1 số fields.
   */
  meta: WorkerRunMeta;
}

/**
 * Domain entity cho worker lock — dùng trong business logic.
 * Mapper convert `_id: ObjectId` → `id: string`.
 */
export interface WorkerLockEntity extends Omit<WorkerLockDoc, "_id"> {
  /** String representation của MongoDB ObjectId. */
  id: string;
}
```

**Indexes:**

- `{ lockKey: 1 }` unique.
- `{ expiresAt: 1 }` TTL với `expireAfterSeconds: 0` — Mongo tự xoá document
  đã expire.

> **Lưu ý TTL vs `isEnabled`**: TTL xoá toàn bộ document khi lock hết hạn.
> `isEnabled: false` sẽ bị xoá theo nếu lock đang held và expire. Ops cần
> acquire lại lock (hoặc insert doc với ownerToken sentinel) trước khi set
> `isEnabled: false` để đảm bảo persist. Hoặc design thêm `permanentDisable`
> collection riêng — out of scope v1.

### 2.2. `withLock` return type

```typescript
// ── packages/worker-core/src/utils/with-lock.ts ──────────────────────────

/** Kết quả trả về từ `withLock`. */
export type WithLockResult<T> =
  | { status: "executed"; value: T }
  | { status: "skipped"; reason: "locked" | "disabled" };
```

Tại sao typed return thay vì `null`:
- Phân biệt rõ `skipped` do lock đang held vs do worker bị disable.
- Caller có thể log/alert khác nhau cho 2 case.

### 2.3. Repo API

```typescript
// ── packages/worker-core/src/infras/repos/types/worker-lock.types.ts ─────

/** Input cho tryAcquire. */
export interface AcquireOptions {
  lockKey: string;
  /** Token đại diện owner — gen `crypto.randomUUID()` trong caller. */
  ownerToken: string;
  /** TTL giây cho lock. Nên > worker Lambda timeout + buffer. */
  ttlSeconds: number;
}
```

```typescript
// ── packages/worker-core/src/infras/repos/worker-lock-repo.ts ────────────
// (CHỈ class + query — không khai báo interface/type ở đây)

export class WorkerLockRepository extends WorkerCoreBaseRepo<WorkerLockEntity, WorkerLockMapper> {
  /**
   * Atomic acquire hoặc reentrant extend.
   * Trả `true` nếu lấy được lock (hoặc reentrant với cùng owner).
   * Trả `false` nếu lock đang held bởi owner khác còn hiệu lực.
   *
   * KHÔNG check `isEnabled` — đây là concern của `withLock` helper.
   * Index: `{ lockKey: 1 }` unique.
   */
  tryAcquire(opts: AcquireOptions): Promise<boolean>;

  /**
   * Gia hạn TTL — chỉ thành công khi lock còn hiệu lực và đúng owner.
   * Dùng khi worker dự kiến chạy lâu hơn `ttlSeconds` ban đầu.
   */
  extend(lockKey: string, ownerToken: string, ttlSeconds: number): Promise<boolean>;

  /**
   * Release — chỉ xoá doc khi đúng owner.
   * Trả `true` nếu released, `false` nếu không phải owner hoặc đã expire.
   * IDEMPOTENT: gọi nhiều lần an toàn.
   */
  release(lockKey: string, ownerToken: string): Promise<boolean>;

  /**
   * Đọc lock doc hiện tại — dùng để check `isEnabled` trước khi acquire.
   * Trả `null` nếu chưa có doc (lock chưa từng được tạo).
   */
  findByKey(lockKey: string): Promise<WorkerLockEntity | null>;

  /**
   * Partial update execution metadata sau khi worker chạy xong.
   * Dùng dot notation để không overwrite toàn bộ `meta` embedded doc.
   * IDEMPOTENT.
   */
  updateMeta(lockKey: string, ownerToken: string, meta: Partial<WorkerRunMeta>): Promise<boolean>;
}
```

### 2.4. `tryAcquire` implementation (upsert atomic)

```typescript
async tryAcquire({ lockKey, ownerToken, ttlSeconds }: AcquireOptions): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  try {
    // Case A: lock chưa tồn tại → upsert tạo mới với isEnabled: true.
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
        $set: {
          ownerToken,
          expiresAt,
          acquiredAt: now,
        },
        $setOnInsert: {
          // isEnabled chỉ set khi insert mới — KHÔNG overwrite giá trị ops đã set.
          isEnabled: true,
          meta: {},
        },
      },
      {
        upsert: true,
        returnDocument: "after",
      },
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

Dùng `$setOnInsert` cho `isEnabled` và `meta` để không overwrite khi ops đã set
`isEnabled: false` — chỉ apply khi document được tạo mới.

### 2.5. `release` implementation

```typescript
async release(lockKey: string, ownerToken: string): Promise<boolean> {
  const result = await this._collection.deleteOne({
    lockKey,
    ownerToken,
  });
  return result.deletedCount === 1;
}
```

### 2.6. `extend` implementation

```typescript
async extend(lockKey: string, ownerToken: string, ttlSeconds: number): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
  const result = await this._collection.updateOne(
    {
      lockKey,
      ownerToken,
      expiresAt: { $gt: now },
    },
    {
      $set: { expiresAt },
    },
  );
  return result.modifiedCount === 1;
}
```

### 2.7. `findByKey` implementation

```typescript
async findByKey(lockKey: string): Promise<WorkerLockEntity | null> {
  return this.findOne({ lockKey });
}
```

### 2.8. `updateMeta` implementation

```typescript
async updateMeta(
  lockKey: string,
  ownerToken: string,
  meta: Partial<WorkerRunMeta>,
): Promise<boolean> {
  // Dùng dot notation để partial update meta — không overwrite toàn bộ embedded doc.
  const $set: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (value !== undefined) {
      $set[`meta.${key}`] = value;
    }
  }

  const result = await this._collection.updateOne(
    {
      lockKey,
      ownerToken,
    },
    {
      $set,
    },
  );
  return result.modifiedCount === 1;
}
```

---

## 3. Package placement — `@megawin/worker-core`

Tạo package mới `packages/worker-core` thay vì `packages/worker-lock`.

**Lý do chọn `worker-core` thay vì các alternatives:**

| Option | Vấn đề |
| --- | --- |
| `worker-lock` (tên cũ) | Quá hẹp — nếu sau thêm worker metrics, config helpers, v.v. sẽ phải tạo thêm package |
| Nhét vào `app-core` | `app-core` không có MongoDB dependency — thêm vào sẽ pollution cho consumers chỉ dùng `aws/` hoặc `lambda/` |
| Nhét vào `game-core-application` | Sai scope — lock không phải game concern |
| `worker-core` | Nhất quán với pattern `*-core` trong monorepo; đủ rộng để mở rộng |

### 3.1. Cấu trúc thư mục

```
packages/worker-core/
├── package.json                    → name: "@megawin/worker-core"
├── tsconfig.json
├── tsconfig.build.json
└── src/
    ├── index.ts                    ← Main barrel
    ├── entities/
    │   ├── worker-lock.ts          ← WorkerLockDoc, WorkerLockEntity, WorkerRunMeta
    │   └── index.ts
    ├── infras/
    │   ├── base-repo.ts            ← WorkerCoreBaseRepo extends MongoRepository, DB "megawin"
    │   ├── repos/
    │   │   ├── types/
    │   │   │   ├── index.ts        ← Barrel re-export
    │   │   │   └── worker-lock.types.ts  ← AcquireOptions
    │   │   ├── worker-lock-repo.ts ← CHỈ class + query, import từ ./types
    │   │   └── index.ts            ← Re-export class + types
    │   └── mappers/
    │       ├── worker-lock-mapper.ts ← WorkerLockMapper: _id → id
    │       └── index.ts
    └── utils/
        └── with-lock.ts            ← withLock helper
```

### 3.2. `WorkerCoreBaseRepo`

```typescript
// ── packages/worker-core/src/infras/base-repo.ts ─────────────────────────

import { MongoRepository, Constants } from "@megawin/data/mongo";
import type { BaseEntity, MongoMapper } from "@megawin/data/mongo";
import type { Document } from "mongodb";

/** Base repository cho tất cả collections trong DB "megawin" thuộc worker-core. */
export class WorkerCoreBaseRepo<
  TEntity extends BaseEntity,
  TDataMapper extends MongoMapper<Document, TEntity> | undefined = undefined,
> extends MongoRepository<TEntity, TDataMapper> {
  constructor({ collName, dataMapper }: { collName: string; dataMapper?: TDataMapper }) {
    super({
      collName,
      dbName: Constants.Default.DbName,
      dataMapper,
    });
  }
}
```

### 3.3. `WorkerLockMapper`

```typescript
// ── packages/worker-core/src/infras/mappers/worker-lock-mapper.ts ─────────

import { DefaultMongoMapper } from "@megawin/data/mongo";
import type { WorkerLockDoc, WorkerLockEntity } from "../../entities";

/**
 * Mapper convert WorkerLockDoc (MongoDB) ↔ WorkerLockEntity (domain).
 * Convert _id: ObjectId → id: string.
 */
export class WorkerLockMapper extends DefaultMongoMapper<WorkerLockDoc, WorkerLockEntity> {
  toDomain(doc: WorkerLockDoc): WorkerLockEntity {
    const { _id, ...rest } = doc;
    return {
      ...rest,
      id: _id.toString(),
    };
  }
}
```

### 3.4. Exports

```typescript
// ── packages/worker-core/src/index.ts ─────────────────────────────────────

export { WorkerLockRepository } from "./infras/repos";
export { withLock } from "./utils/with-lock";
export type { WithLockResult } from "./utils/with-lock";
export type { AcquireOptions } from "./infras/repos";
export type { WorkerLockEntity, WorkerRunMeta } from "./entities";
```

### 3.5. `withLock` helper

```typescript
// ── packages/worker-core/src/utils/with-lock.ts ──────────────────────────

/** Kết quả trả về từ `withLock`. */
export type WithLockResult<T> =
  | { status: "executed"; value: T }
  | { status: "skipped"; reason: "locked" | "disabled" };

/**
 * Distributed lock helper — wrap business function với acquire/release lifecycle.
 *
 * ## Lifecycle của meta fields
 *
 * | Field           | Ghi khi nào                          | Ghi bởi  |
 * | --------------- | ------------------------------------ | -------- |
 * | `cursor`        | Worker tự gọi `updateMeta({ cursor })` | Worker   |
 * | `lastSuccessAt` | Sau khi fn() hoàn thành không lỗi   | withLock |
 * | `lastError`     | Khi fn() throw (set); khi success (clear) | withLock |
 *
 * ## Flow
 * 1. `findByKey` → check `isEnabled`. Nếu `false` → skip "disabled".
 * 2. `tryAcquire` → nếu fail → skip "locked".
 * 3. Chạy `fn(ctx)` — `ctx.heartbeat()` gia hạn TTL khi cần.
 * 4. Cập nhật `lastSuccessAt` + clear `lastError` sau khi fn thành công.
 * 5. Cập nhật `lastError` khi fn throw — không suppress exception.
 * 6. `release` trong finally — unlock dù fn throw.
 *
 * @param lockKey - Unique key cho worker. VD: `"tenant-dispatch:main"`.
 * @param ttlSeconds - TTL giây. Nên > Lambda timeout + buffer.
 * @param fn - Business function. Nhận ctx với heartbeat helper.
 */
export async function withLock<T>(
  lockKey: string,
  ttlSeconds: number,
  fn: (ctx: { heartbeat: () => Promise<boolean> }) => Promise<T>,
): Promise<WithLockResult<T>> {
  const repo = new WorkerLockRepository();
  const ownerToken = crypto.randomUUID();

  // Check isEnabled trước — tránh tốn 1 RT Mongo acquire khi đã disabled.
  const existing = await repo.findByKey(lockKey);
  if (existing && !existing.isEnabled) {
    console.warn(`[worker-lock] disabled — skip: ${lockKey}`);
    return { status: "skipped", reason: "disabled" };
  }

  const acquired = await repo.tryAcquire({ lockKey, ownerToken, ttlSeconds });
  if (!acquired) {
    console.warn(`[worker-lock] already held — skip: ${lockKey}`);
    return { status: "skipped", reason: "locked" };
  }

  try {
    const value = await fn({
      heartbeat: () => repo.extend(lockKey, ownerToken, ttlSeconds),
    });

    // Thành công: ghi lastSuccessAt + clear lastError.
    await repo.updateMeta(lockKey, ownerToken, {
      lastSuccessAt: new Date().toISOString(),
      lastError: undefined,
    });

    return { status: "executed", value };
  } catch (err) {
    // Thất bại: ghi lastError để ops debug. Không suppress exception.
    const lastError = err instanceof Error ? err.message : String(err);
    await repo
      .updateMeta(lockKey, ownerToken, { lastError })
      .catch(() => { /* ignore — meta failure không override business error */ });
    throw err;
  } finally {
    await repo.release(lockKey, ownerToken);
  }
}
```

---

## 4. Usage ví dụ — tenant-dispatch

```typescript
// apps/worker-tenant-dispatch/src/handlers/dispatch/process-batch.ts
import { withLock } from "@megawin/worker-core";
import { ProcessMainDispatchBatchUseCase } from "@megawin/tenant-dispatch/use-cases/process";

const useCase = new ProcessMainDispatchBatchUseCase();

export async function handler(event: unknown, ctx: { awsRequestId: string }) {
  const result = await withLock(
    "tenant-dispatch:main",
    90,
    async ({ heartbeat }) => {
      return await useCase.run();
    },
    {
      version: process.env.WORKER_VERSION,
      invocationId: ctx.awsRequestId,
    },
  );

  if (result.status === "skipped") {
    console.info(`[tenant-dispatch] main skipped — reason: ${result.reason}`);
    return { skipped: true, reason: result.reason };
  }

  console.info(`[tenant-dispatch] ${JSON.stringify(result.value)}`);
  return result.value;
}
```

Tương tự cho retry lane: `lockKey = "tenant-dispatch:retry"`, `ttl = 330`
(> 300s Lambda timeout + buffer).

Ví dụ worker với checkpoint cursor:

```typescript
// Worker settle dùng cursor để biết đã xử lý đến đâu
const result = await withLock("worker-settle:keno", 120, async ({ heartbeat }) => {
  const lock = await repo.findByKey("worker-settle:keno");
  const lastCursor = lock?.meta.cursor; // resume từ đây nếu run lại sau crash

  const { processedCount, nextCursor } = await settleUseCase.run({ fromCursor: lastCursor });

  // Cập nhật cursor để lần sau resume đúng chỗ.
  await repo.updateMeta("worker-settle:keno", ownerToken, {
    cursor: nextCursor,
    processedCount,
  });

  return { processedCount };
});
```

---

## 5. Hybrid strategy: reservedConcurrency vs distributed lock


| Lớp                      | Phạm vi bảo vệ                                               | Chi phí                    |
| ------------------------ | ------------------------------------------------------------ | -------------------------- |
| `reservedConcurrency: 1` | 1 AWS account, 1 Lambda function. Không chống race boundary. | Free                       |
| `worker-core` + withLock | Distributed, cross-region, cross-function.                   | +2 RT Mongo per invocation |


**Khuyến nghị**: layer cả 2. `reservedConcurrency` là line of defense #1 (miễn
phí, cover 99% cases). `worker-core` là line #2 cho strict correctness.

> **+2 RT note**: `findByKey` (check isEnabled) + `tryAcquire` = 2 Mongo round-trips
> trước khi fn chạy. Có thể tối ưu thành 1 RT nếu cần, nhưng không cần thiết cho
> Lambda scheduled trigger.

---

## 6. Edge cases


| Case                                                       | Xử lý                                                                                                                   |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Lambda A acquire, crash trước khi release                  | TTL expire → Lambda B tiếp theo takeover. Đảm bảo `ttl > worker runtime`.                                               |
| Lambda A heartbeat fail (lock expired từ lâu)              | `extend` trả `false` → A nên abort công việc để B không collide. Use case tự quyết action.                              |
| Clock skew giữa Lambda & Mongo                             | Mongo TTL dựa `expiresAt` server-side → an toàn khi Lambda slew time. `new Date()` nên dùng caller client đủ chính xác. |
| Hai Lambda cùng gọi `tryAcquire` đúng thời điểm TTL expire | MongoDB `findOneAndUpdate` atomic — chỉ 1 bên thắng upsert, bên kia bị duplicate key → fail gracefully.                 |
| Lock doc bị xoá tay (ops)                                  | Lần acquire tiếp theo tạo mới — không crash, không corruption (lock chỉ là synchronization primitive).                  |
| Ops set `isEnabled: false`, TTL expire → doc bị xoá        | Lần acquire tiếp theo tạo doc mới với `isEnabled: true` (qua `$setOnInsert`). Ops cần set lại `isEnabled: false`.      |
| `updateMeta` fail sau khi fn thành công                    | Không throw — meta là observability, không ảnh hưởng correctness. Log warning là đủ.                                   |


---

## 7. Testing plan

- Unit: `WorkerLockRepository` với mongodb-memory-server.
  - `tryAcquire` thành công khi không có lock.
  - `tryAcquire` fail khi lock đã hold bởi owner khác.
  - `tryAcquire` reentrant với cùng owner.
  - `tryAcquire` takeover khi lock expired.
  - `tryAcquire` dùng `$setOnInsert` — không overwrite `isEnabled: false` đã set.
  - `release` chỉ work với đúng owner.
  - `extend` chỉ work khi lock còn hiệu lực + đúng owner.
  - `updateMeta` partial update đúng field, không overwrite toàn bộ `meta`.
- Unit: `withLock`
  - Skip với `reason: "disabled"` khi `isEnabled: false`.
  - Skip với `reason: "locked"` khi lock đang held.
  - Ghi `lastSuccessAt` khi fn thành công.
  - Ghi `lastFailedAt` + `lastError` khi fn throw.
  - Release trong finally dù fn throw.
- Integration: 2 Node process cùng call `withLock` trên cùng `lockKey` → chỉ 1 bên fn() chạy.
- Race test: 10 process đồng thời → đúng 1 thắng, 9 return `{ status: "skipped" }`.

---

## 8. Deployment

1. Tạo package `@megawin/worker-core` + publish workspace.
2. Add TTL index migration:

```javascript
db.worker_locks.createIndex({ lockKey: 1 }, { unique: true });
db.worker_locks.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
```

3. Adopt gradual: `worker-tenant-dispatch` trước (2 lane), sau đó các worker khác.
4. Khi disable worker: `db.worker_locks.updateOne({ lockKey: "..." }, { $set: { isEnabled: false } })`.
   Nếu doc chưa tồn tại, insert thủ công với `isEnabled: false` và `expiresAt` xa tương lai
   (TTL index sẽ giữ doc alive).

---

## 9. Alternatives đã cân nhắc


| Option                             | Lý do loại                                                                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| DynamoDB conditional writes        | Thêm service. Mongo đã có.                                                                                                   |
| Redis/ElastiCache                  | Thêm service. Ops burden.                                                                                                    |
| AWS Step Functions Distributed Map | Over-engineering cho scheduled Lambda đơn giản.                                                                              |
| Chỉ dùng `reservedConcurrency: 1`  | Primary hiện tại. Nhưng có edge case (warm-pool boundary) — có khi 2 invocation overlap ngắn. Distributed lock đóng gap này. |
| Package `worker-lock`              | Tên quá hẹp. `worker-core` đủ rộng cho future worker utilities.                                                             |
| Nhét vào `app-core`                | `app-core` không có MongoDB — sẽ pollution consumers chỉ dùng `aws/` hoặc `lambda/`.                                        |


---

## 10. Acceptance criteria

- Package `@megawin/worker-core` được publish workspace.
- `withLock` helper test pass đủ cases (bao gồm `isEnabled: false`).
- TTL index được tạo trên `worker_locks` trong env dev + staging.
- Adopt ở worker-tenant-dispatch (main + retry).
- Khi chạy 2 Lambda invocation chồng nhau → 1 bên `{ status: "skipped", reason: "locked" }` trong log.
- Khi ops set `isEnabled: false` → worker skip với `{ status: "skipped", reason: "disabled" }`.

---

## 11. Không-scope

- Fairness / queue waiter. Lambda scheduled trigger không cần — next tick sẽ thử lại.
- Lock release trên SIGTERM graceful (Lambda KHÔNG gửi SIGTERM trước timeout;
  dựa TTL là đủ).
- Metrics custom — có thể add sau (`lock_acquire_success`, `lock_takeover_stale`).
- Persistent `isEnabled: false` khi TTL expire — cần design `permanent_worker_configs`
  collection riêng nếu cần (out of scope v1).

