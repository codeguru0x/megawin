# Audit Log System — `@megawin/audit`

> **Scope**: Hệ thống audit log chung, tích hợp xuyên suốt toàn hệ thống.
> Dùng cho mọi mục đích: theo game, theo tài khoản, theo loại hành động,
> theo đối tượng, theo tenant, theo thời gian.
> **Storage**: MongoDB — DB **riêng** `megawin-audit`, collection `audit_logs`.
> **Retention**: TTL 90 ngày (tự xoá).
> **Tích hợp**: KHÔNG đụng `@megawin/next`. Chỉ **gọi thủ công** trong use-case.
> **Phạm vi audit**: Hành động con người (staff/admin/agent) + action hệ
> thống quan trọng (settle/void/resettle/publish).

---

## 1. Bối cảnh & quyết định

### 1.1 Stack hiện tại (đã khảo sát)

| Thành phần | Công nghệ |
|---|---|
| Compute | AWS Lambda (Node 24), Serverless Framework, `ap-southeast-1` |
| Database | MongoDB (Atlas, driver `mongodb@7`) qua `@megawin/data` |
| Streaming/Queue | Kinesis, SQS, Step Functions |
| Observability | Axiom (dataset `megawin-internal-{dev,prod}`) cho Lambda logs/traces |
| BO Web | Next.js 16 + better-auth, API route qua `withApi()` builder |
| Auth | Cognito (Lambda), better-auth (BO web) |

### 1.2 Tại sao MongoDB (không Atlas Search / Elasticsearch / DynamoDB)

- **Audit log = 90% lọc theo cột cấu trúc** (ai/làm gì/khi nào) → compound
  index của Mongo nhanh, miễn phí, đủ dùng. `find()` thắng full-text engine
  cho kiểu query này.
- **Atlas Search / OpenSearch / Elasticsearch**: thêm node trả tiền 24/7 →
  trái tiêu chí "ưu tiên rẻ" + trái mô hình serverless. Chỉ cân nhắc khi cần
  full-text mạnh hoặc SIEM toàn công ty (bài toán khác).
- **DynamoDB**: query đa điều kiện kém linh hoạt → trái tiêu chí "dễ query".
- **Axiom (đã có)**: hợp cho ops/full-text time-series, nhưng khó nhúng BO web
  làm system-of-record cho audit nghiệp vụ.

### 1.3 Quyết định đã chốt

| Vấn đề | Quyết định |
|---|---|
| Storage | MongoDB, DB riêng `megawin-audit`, collection `audit_logs` |
| Env URI | `MONGODB_AUDIT_URI` (mới, tách khỏi `MONGODB_URI`) |
| Retention | TTL 90 ngày |
| Tích hợp | Manual — gọi `AuditLogger.record()` trong use-case. KHÔNG hook `@megawin/next` |
| Phạm vi | Human actions + system actions quan trọng |
| Actor context | Chuẩn hóa `AuditActor`, thread từ route/handler xuống use-case input (xem §1.4 + §8.0) |

### 1.4 Gap thực tế: actor identity chưa xuống tới use-case

Đây là **rủi ro triển khai lớn nhất** — không phải việc tạo package (đã có khuôn
`tx_logs`), mà là việc lấy được "ai làm" tại tầng use-case.

Actor identity hiện sống ở **tầng route/handler**, KHÔNG ở use-case:

| Runtime | Nguồn actor | Shape |
|---|---|---|
| Lambda (`api-player`, `api-tenant`, worker) | `event.user` (`AuthContext`) | `sub`, `username`, `accountId`, `roles[]`, `accountType`, `tenantId?` — `packages/auth/src/authorization-api-gateway.ts:16-41` |
| Backoffice (Next.js) | `session.user` (`RouteSession`) | `id`, `sub`, `email`, `name`, `username`, `roles[]`, `accountStatus`, `accountId`, `tenantId`, `accountType` — `packages/next/src/server/api-route.ts:50-65` |
| Worker tự chạy (Step Function) | Không có actor người | → dùng `AuditActor.system()` |

Hai shape **khác nhau** (`event.user` không có `email`/`name`; `username` là tên
gần nhất với "name"). Phần lớn use-case mutate (`UpdateGameConfigUseCase`,
`update-tenant`, `set-account-password`) **chưa nhận actor trong input DTO** →
phải mở rộng input. Để tránh mỗi use-case tự định nghĩa lại shape actor, chốt:
**một interface `AuditActor` duy nhất + 2 factory map từ 2 nguồn trên** (§8.0).

---

## 2. Schema `AuditLogDoc`

Đặt tại `packages/audit/src/entities/audit-log.ts`. Mọi field dùng để filter
là **top-level + normalized** để index hiệu quả.

```typescript
interface AuditLogDoc extends BaseEntity {
  // ── WHEN ──
  /** Thời điểm hành động (UTC). Nền cho TTL index + sort mặc định. */
  ts: Date;

  // ── WHO (actor) ──
  /** accountId của người/hệ thống thực hiện. "system" nếu máy tự chạy. */
  actorId: string;
  /** Loại chủ thể: company | agent | player | system. */
  actorType: AuditActorType;
  /** Snapshot username/email lúc hành động — đọc nhanh khỏi join. */
  actorName: string;
  /** Snapshot roles lúc hành động. */
  actorRoles: string[];
  /** tenantId liên quan. "" nếu là company action không thuộc tenant. */
  tenantId: string;

  // ── WHAT (action) ──
  /** Mã hành động format `category.verb`. VD: "draw.publish_result". */
  action: string;
  /** Nhóm: draw | player | config | auth | finance | system. */
  category: AuditCategory;
  /** Game key: keno | bingo18 | ... | "" nếu không thuộc game cụ thể. */
  game: string;

  // ── ON (target) ──
  /** Loại đối tượng bị tác động: draw | player | game_config | account. */
  targetType: string;
  /** Id đối tượng: drawId, playerId... "" nếu không có. */
  targetId: string;

  // ── OUTCOME ──
  /** success | failure. */
  status: AuditStatus;
  /** Mã lỗi khi status = failure. */
  errorCode?: string;

  // ── CONTEXT (không index, xem chi tiết) ──
  /** Diff trước/sau cho mutation. */
  changes?: { before?: unknown; after?: unknown };
  /** Metadata bổ sung. */
  metadata?: {
    ip?: string;
    userAgent?: string;
    requestId?: string;
    method?: string;
    path?: string;
    extra?: Record<string, unknown>;
  };
}
```

**Vì sao tách `category` + `game` + `action` riêng**: mỗi chiều query là field
độc lập có index → mọi combo filter (theo game / theo tài khoản / theo loại
hành động / theo tenant) đều nhanh.

---

## 3. Enums & Action Registry

Đặt tại `packages/audit/src/entities/enums.ts`.

```typescript
export const AuditActorType = {
  Company: "company",
  Agent: "agent",
  Player: "player",
  System: "system",
} as const;
export type AuditActorType = (typeof AuditActorType)[keyof typeof AuditActorType];

export const AuditCategory = {
  Draw: "draw",
  Player: "player",
  Config: "config",
  Auth: "auth",
  Finance: "finance",
  System: "system",
} as const;
export type AuditCategory = (typeof AuditCategory)[keyof typeof AuditCategory];

export const AuditStatus = {
  Success: "success",
  Failure: "failure",
} as const;
export type AuditStatus = (typeof AuditStatus)[keyof typeof AuditStatus];

/** Registry các action — tránh gõ tay sai chính tả. */
export const AUDIT_ACTIONS = {
  DrawPublishResult: "draw.publish_result",
  DrawRepublishResult: "draw.republish_result",
  DrawVoid: "draw.void",
  DrawResettle: "draw.resettle",
  DrawUpdateVietlottRef: "draw.update_vietlott_ref",
  PlayerSuspend: "player.suspend",
  PlayerActivate: "player.activate",
  ConfigUpdateGlobal: "config.update_global",
  ConfigUpdateTenant: "config.update_tenant",
  AuthLogin: "auth.login",
  AuthLogout: "auth.logout",
  AuthLoginFailed: "auth.login_failed",
  FinanceAdjustBalance: "finance.adjust_balance",
  SystemSettleFinalized: "system.settle_finalized",
  SystemVoidFinalized: "system.void_finalized",
} as const;
```

| Category | Action ví dụ | Target |
|---|---|---|
| `draw` | publish_result, republish_result, void, resettle, update_vietlott_ref | drawId |
| `player` | suspend, activate | playerId |
| `config` | update_global, update_tenant | game_config id |
| `auth` | login, logout, login_failed | accountId |
| `finance` | adjust_balance, payout_override | accountId |
| `system` | settle_finalized, void_finalized | drawId |

---

## 4. Cấu trúc package `@megawin/audit`

Tuân thủ rule `mongodb-repository-architecture` (tách types/, repo chỉ chứa
class + query, use-case không query trực tiếp).

```
packages/audit/
├── package.json                 # exports: ./entities, ./logger, ./repos, ./use-cases, ./indexes
├── tsconfig.json
├── tsconfig.build.json
├── src/
│   ├── entities/
│   │   ├── audit-log.ts          # AuditLogDoc
│   │   ├── enums.ts              # AuditActorType, AuditCategory, AuditStatus, AUDIT_ACTIONS
│   │   └── index.ts
│   ├── infras/repos/
│   │   ├── audit-log-repo.ts     # AuditLogRepository extends MongoRepository
│   │   ├── types/
│   │   │   ├── audit-query.types.ts   # AuditLogFilter, AuditLogPage
│   │   │   └── index.ts
│   │   └── index.ts
│   ├── logger/
│   │   ├── audit-logger.ts       # AuditLogger.record() + recordAndWait()
│   │   ├── actor.ts              # AuditActor interface + systemActor()
│   │   ├── types.ts              # AuditEventInput
│   │   └── index.ts
│   ├── use-cases/
│   │   ├── list-audit-logs.ts    # NextApiUseCase: filter + paging
│   │   ├── get-audit-log.ts      # chi tiết 1 record
│   │   └── index.ts
│   └── indexes/
│       └── index.ts              # compound index + TTL
```

### 4.1 `package.json` (đề xuất)

```json
{
  "name": "@megawin/audit",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsc --watch",
    "check-types": "tsc --noEmit",
    "build": "tsc -p tsconfig.build.json",
    "clean": "rm -rf dist"
  },
  "exports": {
    "./entities": { "types": "./src/entities/index.ts", "import": "./src/entities/index.ts", "default": "./dist/entities/index.js" },
    "./logger":   { "types": "./src/logger/index.ts",   "import": "./src/logger/index.ts",   "default": "./dist/logger/index.js" },
    "./repos":    { "types": "./src/infras/repos/index.ts", "import": "./src/infras/repos/index.ts", "default": "./dist/infras/repos/index.js" },
    "./use-cases":{ "types": "./src/use-cases/index.ts", "import": "./src/use-cases/index.ts", "default": "./dist/use-cases/index.js" },
    "./indexes":  { "types": "./src/indexes/index.ts",  "import": "./src/indexes/index.ts",  "default": "./dist/indexes/index.js" }
  },
  "dependencies": {
    "@megawin/data": "workspace:*",
    "@megawin/shared": "workspace:*",
    "mongodb": "^7.1.1"
  },
  "devDependencies": {
    "@megawin/typescript-config": "workspace:*",
    "@types/node": "^25.5.0",
    "typescript": "^6.0.3"
  }
}
```

`use-cases` cần `@megawin/next` (NextApiUseCase) — thêm vào dependencies khi
làm đợt use-case (đợt 3).

---

## 5. `AuditLogRepository`

`packages/audit/src/infras/repos/audit-log-repo.ts` — extends `MongoRepository`,
dùng `mongoEnvKey: "MONGODB_AUDIT_URI"`, `dbName: "megawin-audit"`,
`collName: "audit_logs"`.

Methods:
- `insertAudit(doc: AuditLogDoc): Promise<string>` — ghi 1 record.
- `listByFilter(filter: AuditLogFilter, page, size): Promise<AuditLogPage>` —
  filter đa chiều + paging, sort `{ ts: -1 }`.
- `getById(id: string): Promise<AuditLogDoc | null>`.
- `ensureIndexes(): Promise<void>` — tạo index (gọi từ script init / đợt indexes).

Query types tại `infras/repos/types/audit-query.types.ts`:
```typescript
export interface AuditLogFilter {
  from?: Date;
  to?: Date;
  actorId?: string;
  actorType?: AuditActorType;
  tenantId?: string;
  game?: string;
  category?: AuditCategory;
  action?: string;
  targetType?: string;
  targetId?: string;
  status?: AuditStatus;
}

export interface AuditLogPage {
  data: AuditLogDoc[];
  total: number;
  page: number;
  size: number;
}
```

---

## 6. `AuditLogger` — điểm vào duy nhất

`packages/audit/src/logger/audit-logger.ts`.

```typescript
class AuditLogger {
  /** Fire-and-forget: KHÔNG await trong business path. Lỗi chỉ warn, KHÔNG throw. */
  static record(event: AuditEventInput): void;

  /** Có await — dùng khi cần đảm bảo ghi (compliance critical). */
  static async recordAndWait(event: AuditEventInput): Promise<void>;
}
```

`AuditEventInput` (logger/types.ts): bản "dễ dùng" của `AuditLogDoc` — `ts` tự
điền `new Date()`, `status` mặc định `success`, `id` tự sinh. Logger map sang
doc đầy đủ rồi `insertAudit`.

**Nguyên tắc**: `record()` bọc trong try/catch nội bộ. Lỗi ghi audit KHÔNG
được làm fail business logic.

---

## 7. Index & Retention

`packages/audit/src/indexes/index.ts`:

```typescript
// Sort mặc định + nền TTL
{ ts: -1 }
// TTL 90 ngày
{ key: { ts: 1 }, expireAfterSeconds: 90 * 86400 }
// "theo tài khoản"
{ actorId: 1, ts: -1 }
// "theo đối tượng"
{ targetType: 1, targetId: 1, ts: -1 }
// "theo game + loại hành động"
{ game: 1, action: 1, ts: -1 }
// "theo mục đích"
{ category: 1, ts: -1 }
// "theo tenant"
{ tenantId: 1, ts: -1 }
```

> Lưu ý TTL: cần 1 index riêng `{ ts: 1 }` có `expireAfterSeconds`. Index sort
> `{ ts: -1 }` KHÔNG dùng được cho TTL (TTL yêu cầu single-field ascending).

---

## 8. Tích hợp gọi thủ công trong use-case

### 8.0. `AuditActor` — chuẩn hóa "ai làm hành động"

Đặt tại `packages/audit/src/logger/actor.ts`. Đây là contract DUY NHẤT mà mọi
use-case dùng để nhận actor. KHÔNG để use-case nhận trực tiếp `AuthContext` /
`RouteSession` (lệ thuộc tầng vận chuyển + 2 shape khác nhau).

```typescript
import type { AuditActorType } from "../entities";

/**
 * Định danh chủ thể thực hiện hành động — phẳng, đã normalize, độc lập runtime.
 *
 * Thread từ route/handler xuống use-case input. Use-case KHÔNG biết actor đến
 * từ Cognito JWT (Lambda) hay better-auth session (BO) hay máy tự chạy.
 */
export interface AuditActor {
  /** accountId của người thực hiện. "system" nếu máy tự chạy. */
  id: string;
  /** company | agent | player | system. */
  type: AuditActorType;
  /** Tên hiển thị snapshot: name → username → email (theo thứ tự ưu tiên). */
  name: string;
  /** Roles snapshot lúc hành động. */
  roles: string[];
  /** tenantId liên quan. "" nếu company action không thuộc tenant. */
  tenantId: string;
}

/** Actor cho action hệ thống (worker Step Function, cron). */
export const systemActor = (): AuditActor => ({
  id: "system",
  type: "system",
  name: "system",
  roles: [],
  tenantId: "",
});
```

**Factory map từ 2 nguồn** — đặt tại tầng adapter để `@megawin/audit` không
phụ thuộc `@megawin/auth` / `@megawin/next`:

- `actorFromAuthContext(event.user)` — Lambda. `name = username` (JWT không có
  `name`/`email`). `tenantId = ctx.tenantId ?? ""` (company không có tenant).
- `actorFromSession(session.user)` — BO. `name = name || username || email`.
  `id = accountId`.

> Hai factory này sống cùng nơi định nghĩa `AuthContext` / `RouteSession`
> (tức `@megawin/auth` và `@megawin/next` adapter), HOẶC trong một package
> adapter mỏng, để `@megawin/audit/logger` chỉ export `AuditActor` + `systemActor`
> thuần type — tránh circular dep. Chốt vị trí cụ thể ở đợt 4.

**Luồng thread actor** (vd update game config từ BO):

```
route handler (.auth())          ← có session.user
  → actor = actorFromSession(session.user)
  → useCase.run({ ...input, actor })   ← input DTO mở rộng thêm `actor: AuditActor`
       → execute(): mutate xong → AuditLogger.record({ ...map từ actor })
```

### 8.1. Pattern mẫu

Pattern mẫu (vd trong `VoidDrawUseCase.execute`):

```typescript
import { AuditLogger } from "@megawin/audit/logger";
import { AUDIT_ACTIONS, AuditCategory } from "@megawin/audit/entities";

// input.actor: AuditActor — thread từ route. Worker tự chạy → systemActor().
// ... sau khi void thành công ...
AuditLogger.record({
  actorId: input.actor.id,
  actorType: input.actor.type,
  actorName: input.actor.name,
  actorRoles: input.actor.roles,
  tenantId: input.actor.tenantId,
  action: AUDIT_ACTIONS.DrawVoid,
  category: AuditCategory.Draw,
  game: "bingo18",
  targetType: "draw",
  targetId: input.drawId,
  changes: { before: { status: draw.status }, after: { status: "voiding" } },
  metadata: { ip: input.actor === systemActor() ? undefined : ipFromRoute, extra: { reason: input.reason } },
});
```

> `void-draw` hiện có `voidedBy` (string) — đợt tích hợp thay/bổ sung bằng
> `actor: AuditActor` để có đủ name/roles/type, không chỉ id.

Action target tích hợp ban đầu (đợt 4): `void-draw`, `publish-result`,
`update-game-config` cho 1-2 game làm chuẩn mực, sau đó nhân rộng.

---

## 9. Đọc/xem trên BO web (đợt 5)

- **API route**: `apps/backoffice/src/app/api/audit-logs/route.ts`
  ```typescript
  export const GET = withApi()
    .auth({ roles: [CompanyRole.Admin] })
    .query(filterSchema)
    .handler(async ({ query }) => listAuditLogsUseCase.run(query));
  ```
- **UI**: trang `(main)/audit-logs` — TanStack Table (đã có trong dự án) +
  bộ lọc: khoảng thời gian, actor, game, category, action, targetId. Row click
  → drawer xem `changes` (before/after) + metadata.

---

## 10. Kế hoạch triển khai theo đợt

| Đợt | Nội dung | Output |
|---|---|---|
| **1** | Package nền: `package.json`, tsconfig, entities (AuditLogDoc + enums + AUDIT_ACTIONS), `AuditLogRepository` + types, indexes | Package compile, repo sẵn sàng |
| **2** | `AuditLogger` (record fire-and-forget + recordAndWait) + AuditEventInput + `AuditActor`/`systemActor` (logger/actor.ts) | Logger + actor contract dùng được |
| **3** | `ListAuditLogsUseCase` + `GetAuditLogUseCase` (NextApiUseCase) | Use-case query |
| **4** | Factory `actorFromAuthContext`/`actorFromSession` (adapter) + mở rộng input `actor: AuditActor` + gọi `AuditLogger.record()` trong 2-3 use-case mẫu (void, publish-result, update-game-config) | Pattern thread actor chuẩn mực |
| **5** | API route `audit-logs` + màn hình BO (table + filter + drawer diff) | Xem log trên BO |
| **6** | Script tạo indexes trên Atlas `megawin-audit` + cấu hình `MONGODB_AUDIT_URI` | Production-ready |

> **Đợt hiện tại được duyệt code**: chỉ **Đợt 1 + Đợt 2** (package nền + logger
> + repo) để review trước. Các đợt sau chờ duyệt riêng.

---

## 11. Env & hạ tầng cần chuẩn bị (thủ công, ngoài code)

- Tạo DB `megawin-audit` (cùng cluster Atlas hoặc cluster riêng).
- Thêm `MONGODB_AUDIT_URI` vào:
  - SSM `/${stage}/megawin/MONGODB_AUDIT_URI` (cho Lambda/worker, nếu sau này
    audit từ backend Lambda).
  - `.env.local` của backoffice (KHÔNG commit — tuân thủ rule no-env-file).
- Bật TTL monitor trên Atlas (TTL background task chạy ~60s/lần).

> Agent KHÔNG tạo/sửa file `.env*`. Hướng dẫn user tự thêm `MONGODB_AUDIT_URI`
> từ nguồn credentials của họ.

---

## 12. Nguyên tắc xuyên suốt

1. **Fire-and-forget**: audit KHÔNG làm chậm/fail business logic.
2. **Một điểm vào**: mọi nơi gọi `AuditLogger.record()`.
3. **Schema phẳng + index**: mọi chiều query là field top-level có index.
4. **DRY/KISS**: tái dùng `MongoRepository`, không tự viết Mongo client.
5. **Tách DB**: `megawin-audit` riêng → không ảnh hưởng I/O DB nghiệp vụ.
6. **Action registry**: dùng `AUDIT_ACTIONS` const, không hardcode string rải rác.
7. **Một contract actor**: use-case chỉ nhận `AuditActor` (không nhận `AuthContext`/
   `RouteSession` thô). Map ở tầng route qua factory; worker dùng `systemActor()`.
