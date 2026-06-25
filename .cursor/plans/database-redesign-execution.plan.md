# Database Redesign — Định danh DB, Move Plan & Code Changes

> **Scope**: Định danh chính xác các logical database, map từng collection vào DB,
> đưa ra checklist move trong MongoDB, và plan sửa code tương ứng. Bao gồm cả
> thiết kế account/identity và audit log.
>
> **Bối cảnh chốt** (từ thảo luận):
> - **1 cluster Atlas M30+** với **Analytics Node đã có**. KHÔNG thuê thêm cluster lúc này.
> - **Game gom vào 1 logical DB** `megawin-game` (giữ cross-game aggregate — quan trọng).
> - **Report ghi vào primary, ĐỌC qua Analytics Node** (`readPreference`).
> - Tách logical DB theo concern ở giai đoạn 1 = **chuẩn bị namespace** để mai sau
>   nhấc sang cluster mới chỉ bằng đổi `mongoEnvKey` + copy DB.
>
> **Nguyên tắc**: split = đổi `dbName`/`mongoEnvKey` + migrate collection. KHÔNG sửa query
> (toàn hệ thống không dùng `$lookup`/cross-DB transaction — đã khảo sát).

---

## 1. Hiện trạng (đã khảo sát toàn bộ codebase)

### 1.1 Chỉ 2 logical DB, cùng 1 cluster (`MONGODB_URI`)

| DB hiện tại | Base-repo | Collection |
|---|---|---|
| `megawin` (`Constants.Default.DbName`) | `GameCoreBaseRepo`, `IdentityBaseRepo`, per-game `BaseRepo`, `WorkerCoreBaseRepo`, `TenantCallbackConfigRepo` | game data, identity, **report**, counters, worker_locks |
| `megawin-tenant` (`MegawinTenantDbName`) | `MegawinTenantCoreBaseRepo`, `TenantGatewayBaseRepo`, `TenantDispatchBaseRepo` | `tx_logs`, `tx_intents` (WAL), `tenant_dispatch_orders`, `entry_feed`, `feed_sync_cursor` |

→ **Report đang nằm chung `megawin` với game OLTP** — đây là điểm cần tách namespace.
→ **Identity (`accounts`, `tenants`) cũng chung `megawin`**.

### 1.2 Connection layer sẵn sàng split (xác nhận `packages/data/src/mongo/client.ts`)

- `getMongoClient` cache theo `mongoEnvKey` → đổi env key = đổi cluster.
- `getMongoDb` cache theo `${envKey}::${dbName}`.
- `MongoRepository({ mongoEnvKey, dbName, clientOptions })` → **injectable** cả 3.
- `clientOptions` truyền thẳng vào `new MongoClient` → set được `readPreference`, `maxPoolSize`.

### 1.3 Ràng buộc bất biến (KHÔNG được phá khi move)

| Phát hiện | Hệ quả |
|---|---|
| KHÔNG có `$lookup`/`$unionWith`/`$merge`/`$out` | Move DB không phá query nào |
| Transaction CHỈ ở place-bet, chỉ touch `{game}_tickets`+`{game}_ticket_entries` cùng game | Cặp này phải **cùng cluster** (giai đoạn 1: cùng DB) |
| FK `accountId`/`tenantId` là string, không constraint DB-level | Tách identity DB chỉ cần app trỏ đúng |
| Cross-game daily report gom 1 collection + field `gameProduct` | Phải giữ chung 1 DB để aggregate cross-game |

---

## 2. Định danh DB mới (giai đoạn 1 — vẫn 1 cluster)

5 logical database mới + giữ `megawin` shared, tất cả trên **cùng cluster hiện tại**. Mỗi DB là 1 namespace độc lập,
sẵn sàng nhấc sang cluster riêng sau này.

| Logical DB | mongoEnvKey (giai đoạn 1) | Nội dung | I/O profile |
|---|---|---|---|
| `megawin` (shared/infra) | `MONGODB_URI` | `worker_locks` + thứ cross-cutting tương lai | Hạ tầng, ít I/O |
| `megawin-game` | `MONGODB_URI` | Tất cả game data (7 game + game mới) + counters/seq | OLTP nóng, có transaction |
| `megawin-identity` | `MONGODB_URI` | `accounts`, `tenants` | OLTP nhẹ, critical (auth) |
| `megawin-report` | `MONGODB_URI` (write primary, read Analytics Node) | Tất cả report 2 tầng | Write lúc settle, read nặng dashboard |
| `megawin-tenant` | `MONGODB_URI` | WAL, feed, dispatch (giữ nguyên) | Tích hợp tenant |
| `megawin-audit` | `MONGODB_URI` | `audit_logs` | Fire-and-forget, TTL |

> **`megawin` giữ lại làm DB shared/infra** — KHÔNG xoá. `worker_locks` là lock toàn cục
> (build report, worker), không thuộc game nào → ở đây hợp ngữ nghĩa và **không phải move**.

> **Lưu ý**: Giai đoạn 1 tất cả cùng `MONGODB_URI` (1 cluster). Việc tách `dbName`
> là để **cô lập namespace + bật `readPreference` Analytics cho report**. Khi có
> cluster mới → chỉ đổi `mongoEnvKey` của nhóm cần nhấc + copy DB sang.

---

## 3. Collection → DB Mapping (bảng move cho MongoDB)

### 3.1 `megawin-game` (di chuyển từ `megawin`)

Per-game (× 7 game: `keno`, `lotto535`, `mega645`, `power655`, `max3d`, `max3dpro`, `bingo18`):

```
{game}_tickets
{game}_ticket_entries
{game}_draws
{game}_game_configs
{game}_ticket_lines          (chỉ lotto535, mega645, power655, max3d, max3dpro)
{game}_draw_counters         (chỉ keno, bingo18)
{game}_jackpot_cycle_entries (chỉ lotto535, mega645, power655)
```

Shared game-core counters/sequence (di chuyển từ `megawin` → `megawin-game`):

```
entry_change_seq    (sequence cho entry feed — phục vụ game)
ticket_counters     (sinh ticketNo — phục vụ game)
```

> `worker_locks` **KHÔNG move** — ở lại `megawin` (shared/infra) vì là lock toàn cục.

### 3.2 `megawin-identity` (di chuyển từ `megawin`)

```
accounts
tenants
```

### 3.3 `megawin-report` (di chuyển từ `megawin`)

Tầng A — gom chung, field `gameProduct`:

```
player_settle_game_daily
system_settle_game_daily
system_settle_tenant_daily
system_outstanding_game_daily
```

Tầng B — per-game prefix (× 7 game):

```
{game}_settle_draw_reports
{game}_settle_tenant_reports
{game}_void_draw_reports
{game}_outstanding_draw_reports
```

### 3.4 `megawin-tenant` (GIỮ NGUYÊN — không move)

```
tx_logs
tx_intents
tenant_dispatch_orders
entry_feed
feed_sync_cursor
```

### 3.5 `megawin-audit` (TẠO MỚI)

```
audit_logs
```

> **Caveat cần xác nhận trước khi move**:
> 1. `tenant_callback_config` dùng collection `tenants` ở DB `megawin` (`TenantCallbackConfigRepo`
>    dùng `Constants.Default.DbName`). Khi move `tenants` → `megawin-identity`, repo này
>    PHẢI đổi `dbName` theo. ĐÃ liệt kê ở §Code Changes.
> 2. `sessions`: KHÔNG có collection trong cluster — auth BO dùng better-auth (session
>    token cookie). KHÔNG ảnh hưởng move identity.
> 3. `entry_change_seq` (game) ──stamp──▶ `entry_feed` (tenant): cross-DB sequential write,
>    KHÔNG transaction → an toàn khi 2 DB khác nhau (kể cả khác cluster sau này).

---

## 4. Code Changes — Base-repos tập trung ở `@megawin/data`

> **Nguyên tắc đơn giản hoá (đã chốt)**: Tất cả base-repo định danh theo "đích đến"
> (DB + node) đặt tập trung trong `packages/data/src/mongo/base-repos/`. Repo nghiệp
> vụ **chỉ đổi class cha**, KHÔNG truyền option lẻ vào từng func, KHÔNG sửa query.
> Đọc Analytics = **đổi base class** (`ReportReadRepo`), không phải sửa từng method.

### 4.1 Thêm tên DB mới vào `Constants.Default`

File `packages/data/src/mongo/constants.ts`:

```typescript
Default: {
  /** Shared/infra — worker_locks + cross-cutting. GIỮ NGUYÊN tên cũ. */
  DbName: "megawin",
  /** Game OLTP — tất cả {game}_* + counters/seq. */
  GameDbName: "megawin-game",
  /** Identity — accounts, tenants. */
  IdentityDbName: "megawin-identity",
  /** Report 2 tầng — write primary, read Analytics Node. */
  ReportDbName: "megawin-report",
  /** Tenant integration — WAL, feed, dispatch (giữ nguyên). */
  MegawinTenantDbName: "megawin-tenant",
  /** Audit log — fire-and-forget, TTL. */
  AuditDbName: "megawin-audit",
  // ...
}
```

> `DbName: "megawin"` **không bị deprecated** — nó là DB shared/infra (`worker_locks`).

### 4.2 Sửa `MongoRepository` core — thêm `collectionOptions` tổng quát (1 lần duy nhất)

Để route đọc sang Analytics Node mà KHÔNG đụng client cache (cache theo `mongoEnvKey`),
set option ở **tầng `db.collection(name, options)`**. Dùng `CollectionOptions` đầy đủ
của driver (`mongodb@7.3`) — không chỉ `readPreference`, mà còn `readConcern`,
`writeConcern`, BSON options... cho tương lai.

```typescript
// repository.ts — thêm import
import { CollectionOptions } from "mongodb";

// thêm field
protected _collectionOptions?: CollectionOptions;

// thêm vào constructor params
constructor({
  mongoEnvKey,
  dbName,
  collName,
  clientOptions,
  collectionOptions,   // ← MỚI
  dataMapper,
}: {
  mongoEnvKey?: string;
  dbName: string;
  collName: string;
  clientOptions?: ConstructorParameters<typeof MongoClient>[1];
  collectionOptions?: CollectionOptions;   // ← MỚI
  dataMapper?: TDataMapper;
}) {
  // ... giữ nguyên ...
  this._collectionOptions = collectionOptions;
}

// sửa getCollection() áp collectionOptions
public async getCollection(): Promise<Collection<Document>> {
  if (!this._collection) {
    const db = await this.getDb();
    this._collection = this._collectionOptions
      ? db.collection(this._collName, this._collectionOptions)
      : db.collection(this._collName);
  }
  return this._collection;
}
```

> Thay đổi **backward-compatible**: `collectionOptions` optional, repo cũ không truyền
> → nhánh `else` y như cũ. Chỉ sửa 1 file core.
>
> **Lưu ý `initBeforeUse()`**: hàm này cũng tạo `_collection` (dòng 147-148). Phải
> sửa song song để cùng áp `_collectionOptions`, hoặc cho `initBeforeUse` gọi
> `getCollection()` để DRY.

### 4.3 Các base-repo tập trung — `packages/data/src/mongo/base-repos/`

Cấu trúc, mỗi file là 1 đích (DB + node):

```
packages/data/src/mongo/base-repos/
├── shared-repo.ts        → DbName (megawin),        primary
├── game-repo.ts          → GameDbName,              primary
├── identity-repo.ts      → IdentityDbName,          primary
├── tenant-repo.ts        → MegawinTenantDbName,     primary
├── report-repo.ts        → ReportDbName,            primary  (worker WRITE)
├── report-read-repo.ts   → ReportDbName,            ANALYTICS (dashboard READ)
├── audit-repo.ts         → AuditDbName,             primary  (WRITE)
└── audit-read-repo.ts    → AuditDbName,             ANALYTICS (READ — tùy chọn)
```

Mỗi base cực ngắn. Ví dụ primary:

```typescript
// packages/data/src/mongo/base-repos/game-repo.ts
import { Document } from "mongodb";
import { MongoRepository } from "../repository";
import { MongoMapper } from "../mapper";
import { Constants } from "../constants";
import { BaseEntity } from "../base-entity";

/** Base cho mọi repo game — DB megawin-game (primary). */
export abstract class GameRepo<
  TEntity extends BaseEntity,
  TMapper extends MongoMapper<Document, TEntity> | undefined = undefined,
> extends MongoRepository<TEntity, TMapper> {
  constructor({ collName, dataMapper }: { collName: string; dataMapper?: TMapper }) {
    super({ collName, dbName: Constants.Default.GameDbName, dataMapper });
  }
}
```

Base đọc Analytics (Cách A — collection-level, đã chốt):

```typescript
// packages/data/src/mongo/base-repos/report-read-repo.ts
import { Document, ReadPreference } from "mongodb";
import { MongoRepository } from "../repository";
import { MongoMapper } from "../mapper";
import { Constants } from "../constants";
import { BaseEntity } from "../base-entity";

const ANALYTICS_READ = new ReadPreference("secondary", [{ nodeType: "ANALYTICS" }]);

/**
 * Base cho repo CHỈ ĐỌC report — route mọi query sang Analytics Node.
 * collectionOptions để mở: tương lai thêm readConcern/BSON options tại đây.
 */
export abstract class ReportReadRepo<
  TEntity extends BaseEntity,
  TMapper extends MongoMapper<Document, TEntity> | undefined = undefined,
> extends MongoRepository<TEntity, TMapper> {
  constructor({ collName, dataMapper }: { collName: string; dataMapper?: TMapper }) {
    super({
      collName,
      dbName: Constants.Default.ReportDbName,
      collectionOptions: { readPreference: ANALYTICS_READ },
      dataMapper,
    });
  }
}
```

`report-repo.ts` (WRITE) y hệt `game-repo.ts` nhưng `dbName: ReportDbName`, KHÔNG có
`collectionOptions` → ghi vào primary.

Export tất cả qua `packages/data/src/mongo/index.ts`:

```typescript
export { SharedRepo } from "./base-repos/shared-repo";
export { GameRepo } from "./base-repos/game-repo";
export { IdentityRepo } from "./base-repos/identity-repo";
export { TenantRepo } from "./base-repos/tenant-repo";
export { ReportRepo } from "./base-repos/report-repo";
export { ReportReadRepo } from "./base-repos/report-read-repo";
export { AuditRepo } from "./base-repos/audit-repo";
```

### 4.4 Map base-repo hiện tại → base-repo mới

Repo nghiệp vụ chỉ **đổi class cha**. Bảng đổi:

| Base-repo hiện tại | File | → Base mới |
|---|---|---|
| `GameCoreBaseRepo` (counters/seq) | `game-core-application/.../game-core-base-repo.ts` | `extends GameRepo` |
| per-game `BaseRepo` (× 7) | `game-{game}-application/.../base-repo.ts` | `extends GameRepo` |
| `WorkerCoreBaseRepo` (`worker_locks`) | `worker-core/src/infras/base-repo.ts` | `extends SharedRepo` (giữ `megawin`) |
| `IdentityBaseRepo` | `identity-application/.../identity-base-repo.ts` | `extends IdentityRepo` |
| `TenantCallbackConfigRepo` | `tenant-gateway/.../tenant-callback-config-repo.ts` | `extends IdentityRepo` (đọc `tenants`) |
| per-game report WRITE (× 7 × 4) | `settle-draw-report-repo.ts`, … | `extends ReportRepo` |
| per-game report READ (dashboard) | (các read query report) | `extends ReportReadRepo` |
| system report repos | `game-core-application/.../system-*-repo.ts` | `ReportRepo`/`ReportReadRepo` |
| `MegawinTenantCoreBaseRepo`, `TenantGatewayBaseRepo`, `TenantDispatchBaseRepo` | — | `extends TenantRepo` (đổi tên, cùng `megawin-tenant`) |

> **Quyết định READ vs WRITE report**: 1 collection report cần CẢ ghi (worker settle)
> lẫn đọc (dashboard). Tách thành 2 repo: `{Game}SettleDrawReportRepo extends ReportRepo`
> (worker dùng để ghi) và `{Game}SettleDrawReportReadRepo extends ReportReadRepo`
> (BO/dashboard dùng để đọc). Cùng `collName`, khác base → khác node. Cần rà các
> use-case đọc report để trỏ sang repo Read. Xem §7 bước 1.

### 4.5 `game-core` KHÔNG tự định nghĩa base-repo nữa

`GameCoreBaseRepo`/`MegawinTenantCoreBaseRepo` hiện tự gọi `super({ dbName })`. Sau
refactor, chúng chỉ là alias mỏng kế thừa `GameRepo`/`TenantRepo` từ `@megawin/data`,
hoặc xoá hẳn và cho repo extend thẳng base mới. Giảm trùng lặp định nghĩa DB.

### 4.6 `maxPoolSize` — chưa cần giai đoạn 1

Cách A dùng chung client với primary (cùng `MONGODB_URI`) → KHÔNG tách pool riêng được.
`maxPoolSize` set ở `clientOptions` ảnh hưởng cả primary lẫn analytics read. Giai đoạn 1
giữ default; khi tách cluster analytics (chuyển sang Cách B với `MONGODB_ANALYTICS_URI`)
mới set `maxPoolSize` riêng. Đổi lúc đó chỉ là **1 file `report-read-repo.ts`**.

---

## 5. Thiết kế Account / Identity (`megawin-identity`)

### 5.1 Hiện trạng

- `accounts` — discriminated union theo `type` (`company`/`agent`/`player`), đã có
  `tenantId` cho agent/player, gắn Cognito (`cognitoPoolId`, `cognitoSub`, `cognitoUsername`).
- `tenants` — đại lý. Cũng được `TenantCallbackConfigRepo` (tenant-gateway) đọc.
- Cả 2 ở `megawin`. Auth: Cognito JWT (Lambda) + better-auth (BO web, session cookie).

### 5.2 Thiết kế giai đoạn 1 — tách namespace `megawin-identity`

Chỉ move 2 collection `accounts`, `tenants` sang DB `megawin-identity` (cùng cluster):

- `IdentityBaseRepo` → `extends IdentityRepo` (DB `megawin-identity`).
- `TenantCallbackConfigRepo` → `extends IdentityRepo` (vì đọc `tenants`).
- KHÔNG đổi query. FK `tenantId`/`accountId` là string → cross-DB read an toàn (no `$lookup`).

### 5.3 Chuẩn bị multi-tenant account management (tương lai)

User dự kiến "quản lý tài khoản cho tenant không có tài khoản riêng" → `accounts` phình to.
Chuẩn bị ngay từ giai đoạn 1:

| Việc | Lý do |
|---|---|
| Index `{ tenantId: 1, type: 1, status: 1 }` trên `accounts` | Filter "tất cả player/agent của 1 tenant" ở quy mô lớn |
| Index `{ tenantId: 1, username: 1 }` unique | Username unique trong scope tenant |
| Giữ `accounts` ở DB riêng `megawin-identity` ngay | Mai sau nhấc sang cluster identity riêng = đổi `mongoEnvKey` + copy DB |
| Khi đạt quy mô → **shard key `tenantId`** cho `accounts` | Scale ngang thật, không tách thêm logical DB |

### 5.4 Vì sao identity KHÔNG sang cluster analytics

Identity nằm trên **critical path** (mọi request auth đụng `accounts`). Phải ở gần
game OLTP (giai đoạn 1: cùng cluster; tương lai: cluster "core" cùng game), KHÔNG
đặt cùng report/audit (analytics-class, có thể chậm/sập tạm thời).

---

## 6. Thiết kế Audit Log (`megawin-audit`)

> Đã có plan chi tiết `.cursor/plans/audit-log-system.plan.md` (`@megawin/audit`).
> Phần này chỉ chốt **vị trí DB** + **điểm tích hợp** trong bối cảnh redesign.

### 6.1 Vị trí & cơ chế

| Hạng mục | Quyết định |
|---|---|
| DB | `megawin-audit` (giai đoạn 1: cùng cluster `MONGODB_URI`) |
| Collection | `audit_logs` |
| Ghi | Fire-and-forget `AuditLogger.record()` — swallow error, KHÔNG chặn business logic (giống `tx_logs`) |
| Đọc | Qua Analytics Node (`readPreference`) như report |
| Retention | TTL index trên `createdAt` (vd 90-180 ngày tuỳ compliance) |
| Cluster tương lai | Nhấc cùng nhóm analytics (report + audit) sang `MONGODB_ANALYTICS_URI` |

### 6.2 AuditActor — chuẩn hoá actor xuống use-case

Vấn đề đã xác định: actor context khác nhau giữa Lambda (`AuthContext` từ Cognito)
và BO (`RouteSession.user` từ better-auth), và chưa xuống tới use-case. Giải pháp:

```typescript
// packages/audit/src/logger/actor.ts
export interface AuditActor {
  id: string;
  type: "company" | "agent" | "player" | "system";
  name: string;
  roles: string[];
  tenantId?: string;
}

/** Actor cho worker/máy tự chạy (settle, void, scheduled job). */
export const systemActor = (): AuditActor => ({
  id: "system",
  type: "system",
  name: "system",
  roles: [],
});

// Adapter ở từng runtime (KHÔNG để use-case biết Cognito/better-auth)
export const actorFromAuthContext = (ctx: AuthContext): AuditActor => ({ /* ... */ });
export const actorFromSession = (s: RouteSession): AuditActor => ({ /* ... */ });
```

Use-case nhận `input.actor: AuditActor` → gọi `AuditLogger.record({ ... })`. API/handler
layer map runtime actor → `AuditActor` bằng adapter trước khi gọi use-case.

### 6.3 Phạm vi audit (theo yêu cầu ban đầu)

| Category | Action | Điểm tích hợp |
|---|---|---|
| `account` | tạo/sửa/khoá tài khoản, đổi role | identity use-cases |
| `game_config` | sửa cấu hình trả thưởng | `update-game-config` use-case mỗi game |
| `draw` | void/settle/schedule kỳ quay | `void-draw`, settle operations |
| `auth` | login/logout/MFA | adapter layer |

---

## 7. Lộ trình thực thi (low-risk, theo thứ tự)

Mỗi bước = đổi `dbName` base-repo + move collection trong MongoDB + verify. KHÔNG sửa query.

| Bước | Nội dung | DB move | Rủi ro |
|---|---|---|---|
| **0** | Thêm tên DB mới vào `Constants.Default` + sửa `MongoRepository` (`collectionOptions`) + tạo base-repos ở `@megawin/data` (chưa đổi repo nghiệp vụ) | — | Không (backward-compatible) |
| **1** | Đổi report WRITE repo `extends ReportRepo`, tách report READ repo `extends ReportReadRepo`, trỏ use-case đọc dashboard sang repo Read. Move report collections → `megawin-report` | report collections | Trung bình |
| **2** | Đổi `IdentityBaseRepo` + `TenantCallbackConfigRepo` `extends IdentityRepo`. Move `accounts`, `tenants` → `megawin-identity` | accounts, tenants | Thấp-TB (auth path — test kỹ) |
| **3** | Đổi per-game `BaseRepo` + `GameCoreBaseRepo` `extends GameRepo`. Move `{game}_*` + counters/seq → `megawin-game`. `worker_locks` ở lại `megawin` (`WorkerCoreBaseRepo extends SharedRepo`) | `{game}_*`, counters, seq | Trung bình (nhiều collection) |
| **4** | Triển khai `@megawin/audit` → `megawin-audit`. Tích hợp AuditActor | tạo `audit_logs` | Thấp (fire-and-forget) |
| **5** (tương lai) | Khi cần: nhấc nhóm analytics (report+audit) sang cluster riêng. `ReportReadRepo` đổi từ `collectionOptions.readPreference` → `mongoEnvKey: "MONGODB_ANALYTICS_URI"` (1 file) | copy 2 DB | TB |
| **6** (tương lai) | Khi 1 game lớn: nhấc `{game}_*` sang cluster riêng `MONGODB_GAME_{X}_URI` | copy collection prefix | TB |

### 7.1 Quy trình move 1 collection trong MongoDB (an toàn)

1. Đảm bảo code đã deploy đọc/ghi đúng `dbName` mới (deploy code TRƯỚC khi move data
   chỉ khi dùng cùng cluster — vì cùng cluster, đổi `dbName` mà chưa move data sẽ
   đọc DB rỗng). **Khuyến nghị**: move data trong maintenance window, hoặc dùng
   `$out`/`mongodump`+`mongorestore` rồi cutover.
2. Với cùng cluster: `db.collection.aggregate([{ $out: { db: "megawin-report", coll: "..." } }])`
   để copy, verify count, rồi đổi code `dbName` + deploy, cuối cùng drop collection cũ.
3. Tạo lại index trên DB mới (index KHÔNG theo collection qua `$out`).

### 7.2 Verify mỗi bước

- `pnpm --filter <package> check-types` sau khi đổi `dbName`.
- So sánh document count DB cũ vs mới trước khi drop.
- Smoke test read/write path (place-bet cho game, login cho identity, dashboard cho report).

---

## 8. Nguyên tắc xuyên suốt

1. **1 cluster giai đoạn 1** — tách DB là chuẩn bị namespace, đòn bẩy thật là Analytics Node.
2. **`megawin` giữ làm DB shared/infra** — `worker_locks` (lock toàn cục) không thuộc game.
3. **Game gom 1 DB** `megawin-game` (+ counters/seq) — giữ cross-game aggregate. Game lớn → tách **cluster**.
4. **Report ghi primary, đọc Analytics Node** — Tầng A gom chung (field `gameProduct`), Tầng B per-game prefix.
5. **Base-repos tập trung ở `@megawin/data`** — repo nghiệp vụ chỉ đổi class cha. Đọc analytics = đổi base class.
6. **`collectionOptions` tổng quát** (không chỉ `readPreference`) ở `MongoRepository` — mở cho readConcern/BSON options tương lai.
7. **Identity ở DB riêng nhưng cùng critical path** — không trộn với analytics.
8. **Audit cùng nhóm analytics** — fire-and-forget, TTL, AuditActor chuẩn hoá.
9. **Move = đổi base class + migrate**, KHÔNG sửa query (no `$lookup`, no cross-DB transaction).
10. **Co-location cứng**: `{game}_tickets`+`{game}_ticket_entries` cùng DB/cluster (transaction place-bet).

---

## 9. KẾT QUẢ THỰC THI (code đã xong) + BẢNG MOVE CUỐI CÙNG

> **Quyết định chốt — giải pháp B:** Per-game report (`{game}_*_reports`) **giữ trong `megawin-game`**,
> đi theo vòng đời game. `megawin-report` chỉ chứa **cross-game aggregate** (`system_*`,
> `player_settle_game_daily`). Transaction place-bet không bị ảnh hưởng (report ghi ngoài transaction).

### 9.1 Thay đổi code đã hoàn tất

- `constants.ts`: thêm `GameDbName`, `IdentityDbName`, `ReportDbName`, `AuditDbName`.
- `repository.ts`: thêm `_collectionOptions` + áp trong `getCollection()` (dùng chung bởi `initBeforeUse()`).
- `base-repos.ts` (mới, ở `@megawin/data/mongo`): `SharedRepo`, `GameRepo`, `IdentityRepo`,
  `TenantRepo`, `ReportRepo`, `ReportReadRepo` (sẵn cho analytics, chưa dùng), `AuditRepo` (sẵn cho plan audit).
- Base nghiệp vụ đổi class cha (alias mỏng, không sửa import nội bộ):
  - per-game `BaseRepo` ×7 → `GameRepo`
  - `GameCoreBaseRepo` → `GameRepo`; `MegawinTenantCoreBaseRepo` → `TenantRepo`
  - 4 system/player aggregate repo (game-core) → `ReportRepo`
  - `IdentityBaseRepo`, `TenantCallbackConfigRepo` → `IdentityRepo`
  - `WorkerCoreBaseRepo` → `SharedRepo`
  - `TenantGatewayBaseRepo`, `TenantDispatchBaseRepo` → `TenantRepo`
- `pnpm -r check-types`: **pass toàn bộ**.

### 9.2 Bảng DB → collection để move tay trên Atlas

**`megawin`** (shared/infra — giữ nguyên tên):
- `worker_locks`

**`megawin-game`** (game OLTP + per-game report + counters/seq):
- Per-game (×7: keno, lotto535, mega645, power655, max3d, max3dpro, bingo18):
  - `{game}_tickets`, `{game}_ticket_entries`, `{game}_draws`, `{game}_game_configs`
  - `{game}_settle_draw_reports`, `{game}_settle_tenant_reports`, `{game}_void_draw_reports`, `{game}_outstanding_draw_reports`
- Có thêm tuỳ game:
  - `keno_draw_counters`, `bingo18_draw_counters`
  - `{game}_ticket_lines` (lotto535, mega645, power655, max3d, max3dpro)
  - `{game}_jackpot_cycles`, `{game}_jackpot_cycle_entries` (lotto535, mega645, power655)
- Counters/sequence shared: `ticket_counters`, `entry_change_seq`

**`megawin-identity`**:
- `accounts`, `tenants`

**`megawin-report`** (cross-game aggregate — đọc Analytics Node về sau):
- `system_settle_game_daily`, `system_settle_tenant_daily`, `system_outstanding_game_daily`
- `player_settle_game_daily`

**`megawin-tenant`** (giữ nguyên tên):
- `tx_logs`, `tx_intents`, `entry_feed`, `feed_sync_cursor`, `tenant_dispatch_orders`

**`megawin-audit`** (tạo sẵn, chưa có collection — triển khai ở plan audit riêng).

### 9.3 Lưu ý khi move

- Cùng cluster: dùng `$out`/`aggregate` hoặc `mongodump`+`mongorestore`, **tạo lại index** trên DB mới.
- Deploy code (đã đổi `dbName`) trong maintenance window, hoặc move data trước → cutover.
- Verify document count cũ vs mới trước khi drop collection cũ.
- `_player_entry_dummy`, `_player_outstanding_dummy` là dummy collName (không phải collection thật) — KHÔNG cần move.
