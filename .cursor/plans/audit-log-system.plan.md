---
name: ""
overview: ""
todos: []
isProject: false
---

# Audit Log System — `@megawin/audit`

> **Scope**: Hệ thống audit log chung, tích hợp xuyên suốt toàn hệ thống.
> Dùng cho mọi mục đích: theo game, theo tài khoản, theo loại hành động,
> theo đối tượng, theo tenant, theo thời gian.
> **Storage**: MongoDB — DB riêng `megawin-audit` (cùng cluster Atlas hiện tại),
> collection `audit_logs`. Dùng chung `MONGODB_URI`, chỉ khác `dbName`.
> **Retention**: TTL 90 ngày (tự xoá).
> **Pagination**: cursor-based `(ts, _id)`. **Timestamp**: lưu UTC, hiển thị VN.
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
| Storage | MongoDB, DB riêng `megawin-audit`, collection `audit_logs` — **cùng cluster Atlas hiện tại** (tách DB logic, KHÔNG tách cluster ở giai đoạn này) |
| Env URI | **Dùng chung `MONGODB_URI`** — chỉ đổi `dbName`. KHÔNG cần `MONGODB_AUDIT_URI` lúc này (xem §1.5) |
| Retention | TTL 90 ngày |
| Tích hợp | Manual — gọi audit trong use-case. **Game-specific helper** bọc payload để gọi gọn (§8.2) |
| Phạm vi | Human actions + system actions quan trọng |
| Actor context | Chuẩn hóa `AuditActor`, thread từ route/handler xuống use-case input (xem §1.4 + §8.0) |
| Timestamp | **Lưu UTC** (`Date` thuần) — Mongo luôn UTC. Format VN chỉ ở display layer (§2.1) |
| Pagination | **Cursor-based `(ts, _id)`** — không dùng page/size (§5.1) |
| Labels | Đặt **trong `@megawin/audit/entities`** (không ở BO) — tái dùng mọi nơi (§9.6) |

### 1.4 Gap thực tế: actor identity chưa xuống tới use-case

Đây là **rủi ro triển khai lớn nhất** — không phải việc tạo package (đã có khuôn
`tx_logs`), mà là việc lấy được "ai làm" tại tầng use-case.

Actor identity hiện sống ở **tầng route/handler**, KHÔNG ở use-case:

| Runtime | Nguồn actor | Shape |
|---|---|---|
| Lambda (`api-player`, `api-tenant`, worker) | `event.user` (`AuthContext`) | `sub`, `username`, `accountId`, `roles[]`, `accountType`, `tenantId?` — `packages/auth/src/authorization-api-gateway.ts:16-41` (discriminated union theo `accountType`) |
| Backoffice (Next.js) | `session.user` (`RouteSession`) | `id`, `sub`, `email`, `name`, `username`, `roles[]`, `accountStatus`, `accountId`, `tenantId`, `accountType` — `packages/next/src/server/api-route.ts:50-65` |
| Worker tự chạy (Step Function) | Không có actor người | → dùng `systemActor()` |

Hai shape **khác nhau** (`event.user` không có `email`/`name`; `username` là tên
gần nhất với "name"; Lambda dùng `accountId` không có `id`). Phần lớn use-case
mutate (`UpdateGameConfigUseCase`, `update-tenant`, `set-account-password`)
**chưa nhận actor trong input DTO** → phải mở rộng input. Để tránh mỗi use-case
tự định nghĩa lại shape actor, chốt: **một interface `AuditActor` duy nhất + 2
factory map từ 2 nguồn trên** (§8.0).

**Mức độ phủ hiện tại (đã verify bằng code):**

| Use-case | Trạng thái actor |
|---|---|
| `void-draw` (7 game) | Có `voidedBy?: string` — **chỉ id, mất name/roles/type** |
| `publish-result` (7 game) | **Chưa thread actor** — route không lấy `session` |
| `update-game-config` (7 game) | **Chưa thread actor** — input DTO không có actor |

**`voidedBy` set KHÔNG nhất quán giữa các game** (rủi ro dữ liệu audit lệch):

| Game | Route set `voidedBy` = |
|---|---|
| keno, lotto535 | `session!.user.username` |
| bingo18, power655, mega645, max3d, max3dpro | `session?.user.email ?? session?.user.id` |

→ Khi tích hợp, **chuẩn hóa qua `actorFromSession()`** để mọi game dùng cùng
`actor.id = accountId`, hết tình trạng `username` vs `email/id`.

### 1.5 `AuditRepo` đã tồn tại — `mongoEnvKey` CÓ CÒN CẦN KHÔNG?

**Trả lời: KHÔNG cần nữa ở giai đoạn này.** Vì đang dùng **chung 1 cluster
Atlas**, việc tách `MONGODB_AUDIT_URI` không mang lại lợi ích thực — cùng cluster
nghĩa là cùng connection pool, cùng I/O capacity. Tách env key chỉ tạo thêm:
- 1 connection pool thừa (cùng trỏ về 1 cluster) → lãng phí connection slot
  (Atlas tier thấp giới hạn connection).
- 1 biến env phải maintain ở SSM + `.env.local` mọi nơi.

`packages/data/src/mongo/base-repos.ts` đã có sẵn `AuditRepo` base + hardcode
`dbName: Constants.Default.AuditDbName = "megawin-audit"`. Constructor hiện tại
**đúng như mong muốn** — KHÔNG truyền `mongoEnvKey` nên dùng `MONGODB_URI` mặc
định (cùng cluster, khác DB):

```typescript
// packages/data/src/mongo/base-repos.ts — GIỮ NGUYÊN, KHÔNG SỬA
export abstract class AuditRepo<...> extends MongoRepository<TEntity, TMapper> {
  constructor({ collName, dataMapper }: BaseRepoArgs<TMapper>) {
    super({ collName, dbName: Constants.Default.AuditDbName, dataMapper });
    // mongoEnvKey mặc định "MONGODB_URI" — đúng, cùng cluster khác DB.
  }
}
```

> **Tách cluster là quyết định tương lai**, không phải bây giờ. Khi audit volume
> lớn tới mức cần isolate I/O (hoặc cần compliance giữ audit ở cluster riêng),
> chỉ cần **thêm 1 dòng** `mongoEnvKey: Constants.Default.AuditDbEnvKey` vào
> `AuditRepo.constructor` + set `MONGODB_AUDIT_URI`. `client.ts` đã cache client
> theo `mongoEnvKey` nên nâng cấp này là non-breaking, không đụng code repo/
> use-case. **Bỏ Đợt 0** (sửa base) khỏi kế hoạch.

→ Tách DB logic (`megawin-audit`) đã đủ "tách" cho mục tiêu hiện tại: audit
collection không lẫn vào DB nghiệp vụ, dễ backup/drop riêng, TTL riêng.

---

## 2. Schema `AuditLogDoc`

Đặt tại `packages/audit/src/entities/audit-log.ts`. Mọi field dùng để filter
là **top-level + normalized** để index hiệu quả.

### 2.1 Quyết định về kiểu field (trả lời câu hỏi thiết kế)

| Field | Quyết định | Lý do |
|---|---|---|
| `actorRoles` | **GIỮ** (`string[]`) | Audit cần trả lời "ai, quyền gì lúc đó". Role có thể đổi sau → snapshot tại thời điểm hành động là giá trị cốt lõi của audit (forensic). Rẻ (vài string), không index. |
| `tenantId` | **`string` rỗng `""`**, KHÔNG optional/null | Field filter top-level. Dùng `""` (không phải `undefined`/`null`) để index ổn định + query `{ tenantId: "" }` lọc được "company-level actions". Tránh `null` vì Mongo index `null` ≠ missing → query phức tạp. |
| `game` | **`string` rỗng `""`**, KHÔNG optional/null | Cùng lý do `tenantId`. `game: ""` = action không thuộc game cụ thể (vd auth.login). Giá trị là `GameProduct` key (keno, bingo18...). |

**Nguyên tắc xuyên suốt**: field **filter top-level** dùng sentinel `""` thay vì
`optional`/`null` — để (a) index đồng nhất, (b) query đơn giản (`{ game: "keno" }`
hoặc `{ game: "" }`), (c) tránh bug `noUncheckedIndexedAccess`. Field **chỉ để
hiển thị/context** (`targetLabel`, `errorCode`, `changes`, `metadata`) thì
`optional` bình thường (không index nên không ảnh hưởng query).

> `game` dùng type `GameProduct | ""` nếu `@megawin/shared` có sẵn enum
> `GameProduct`; nếu chưa, để `string` + JSDoc liệt kê giá trị hợp lệ. Chốt ở
> đợt 1 sau khi kiểm tra `GameProduct` tồn tại.

### 2.2 Định nghĩa

```typescript
interface AuditLogDoc extends BaseEntity {
  // ── WHEN ──
  /**
   * Thời điểm hành động — LƯU UTC (Date thuần, Mongo luôn UTC).
   * Format sang giờ VN chỉ ở display layer (displayVNDateTime). Xem §2.3.
   * Nền cho cursor sort `{ ts: -1, _id: -1 }` + TTL index.
   */
  ts: Date;

  // ── WHO (actor) ──
  /** accountId của người/hệ thống thực hiện. "system" nếu máy tự chạy. */
  actorId: string;
  /** Loại chủ thể: company | agent | player | system. */
  actorType: AuditActorType;
  /** Snapshot tên hiển thị lúc hành động (name → username → email). */
  actorName: string;
  /**
   * Snapshot roles lúc hành động — KHÔNG join về account hiện tại.
   * Cốt lõi forensic: role có thể đổi sau, audit ghi trạng thái tại thời điểm.
   */
  actorRoles: string[];
  /** tenantId liên quan. "" nếu company action không thuộc tenant. */
  tenantId: string;

  // ── WHAT (action) ──
  /** Mã hành động format `category.verb`. VD: "draw.publish_result". UNIQUE per action. */
  action: AuditAction;
  /** Nhóm: draw | player | config | auth | finance | system. */
  category: AuditCategory;
  /** GameProduct key: keno | bingo18 | ... | "" nếu không thuộc game cụ thể. */
  game: string;

  // ── ON (target) ──
  /** Loại đối tượng bị tác động: draw | player | game_config | account | tenant. */
  targetType: AuditTargetType;
  /** Id đối tượng: drawId (YYYY-MM-DD.NNN), playerId... "" nếu không có. */
  targetId: string;
  /**
   * Nhãn hiển thị đối tượng — snapshot để list view khỏi join.
   * VD: "Kỳ 2026-03-07.095". Optional (chỉ hiển thị, không filter).
   */
  targetLabel?: string;

  // ── OUTCOME ──
  /** success | failure. */
  status: AuditStatus;
  /** Mã lỗi khi status = failure. Optional. */
  errorCode?: string;

  // ── CONTEXT (không index, chỉ xem chi tiết) ──
  /** Diff trước/sau cho mutation. Optional. */
  changes?: AuditChanges;
  /** Metadata bổ sung — tổng quát cho cả HTTP request lẫn worker. Xem §2.4. */
  metadata?: AuditMetadata;
}
```

### 2.3 Timestamp: UTC hay VN?

**Lưu UTC, hiển thị VN.** MongoDB lưu mọi `Date` dưới dạng UTC milliseconds —
không có khái niệm timezone trong storage. Convention monorepo (đã verify ở
`@megawin/shared/utils/date`) rất rõ:

- **Lưu**: `ts = new Date()` → UTC thuần. KHÔNG cộng offset +7 vào lúc lưu (sẽ
  sai lệch double-offset).
- **Filter từ FE**: FE gửi `from`/`to` dạng `YYYY-MM-DD` (theo ý người VN) →
  use-case convert qua `toVNStartOfDay(from)` / `toVNEndOfDay(to)` (cộng offset
  +07:00 rồi ra UTC boundary chuẩn). Đây là pattern `list-tx-logs.ts` đang dùng.
- **Hiển thị**: `displayVNDateTime(ts)` → format UTC → `dd/MM/yyyy HH:mm` giờ VN
  qua `TZDate(date, "Asia/Ho_Chi_Minh")`.

→ KHÔNG bao giờ lưu giờ VN vào DB. Chỉ convert ở 2 biên: input filter (VN→UTC)
và display (UTC→VN).

### 2.4 `metadata` — tổng quát cho HTTP request VÀ worker

`metadata` cũ chỉ nghĩ tới HTTP. Tách thành **2 nhánh con tùy nguồn**, cộng
`extra` mở rộng tự do. Đặt type tại `entities/audit-log.ts`:

```typescript
/** Context request HTTP (route BO/Lambda API). Optional toàn bộ. */
interface AuditHttpContext {
  /** IP client (x-forwarded-for / remote). */
  ip?: string;
  userAgent?: string;
  /** Request id để trace cross-service (x-request-id / x-amzn-trace-id). */
  requestId?: string;
  /** HTTP method: POST | PUT | ... */
  method?: string;
  /** Path đã gọi. VD: /api/bingo18/draws/.../void. */
  path?: string;
}

/** Context worker / job hệ thống (Step Function, cron, queue consumer). */
interface AuditWorkerContext {
  /** Tên worker / handler. VD: "settle-finalizer". */
  workerName?: string;
  /** Step Function execution ARN hoặc job id để trace. */
  executionId?: string;
  /** Nguồn kích hoạt: step_function | sqs | kinesis | cron | manual. */
  trigger?: string;
}

/**
 * Metadata audit — một trong hai context (HTTP hoặc worker) + extra.
 * KHÔNG index. Chỉ phục vụ xem chi tiết + trace.
 */
interface AuditMetadata {
  /** Có khi action đến từ HTTP request (BO/Lambda API). */
  http?: AuditHttpContext;
  /** Có khi action đến từ worker/job tự chạy. */
  worker?: AuditWorkerContext;
  /** Metadata nghiệp vụ tự do. VD: { reason: "...", drawNo: 95 }. */
  extra?: Record<string, unknown>;
}

/** Diff trước/sau cho mutation. */
interface AuditChanges {
  before?: unknown;
  after?: unknown;
}
```

> Vì sao tách `http` vs `worker`: một audit record chỉ đến từ 1 trong 2 nguồn.
> Lồng riêng giúp đọc rõ "đây là HTTP hay job", tránh field HTTP rỗng vô nghĩa
> trên record của worker. `extra` giữ phần nghiệp vụ động (reason void, số tiền
> adjust...) không cần schema cứng.

**Vì sao tách `category` + `game` + `action` riêng**: mỗi chiều query là field
độc lập có index → mọi combo filter (theo game / theo tài khoản / theo loại
hành động / theo tenant) đều nhanh.

**Vì sao `game` + `targetType` + `targetId` đủ để build deep-link**: BO resolver
(§9.2) map `(targetType, game, targetId)` → URL. VD `targetType=draw`,
`game=keno`, `targetId=2026-03-07.095` → `/games/keno/operations?draw=2026-03-07.095`.
`targetLabel` chỉ để hiển thị, KHÔNG dùng build link.

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

/** Loại đối tượng bị tác động — dùng cho deep-link resolver (§9.2). */
export const AuditTargetType = {
  Draw: "draw",
  Player: "player",
  GameConfig: "game_config",
  Account: "account",
  Tenant: "tenant",
} as const;
export type AuditTargetType = (typeof AuditTargetType)[keyof typeof AuditTargetType];
```

### 3.1 `AUDIT_ACTIONS` — tổ chức theo CATEGORY, value UNIQUE

**Câu trả lời các câu hỏi:**

1. **Tách theo category hay target?** → **Theo CATEGORY**. Vì `action` format
   là `{category}.{verb}` — category là tiền tố tự nhiên. Target chỉ là "đối
   tượng bị tác động" (đã có `targetType` riêng). Nhóm theo category cho phép
   thêm verb mới vào đúng nhóm mà không phải nghĩ "target nào".

2. **Value có unique không?** → **CÓ, bắt buộc unique toàn cục.** Mỗi action là
   1 string định danh duy nhất 1 loại hành động. Format `{category}.{verb}` tự
   đảm bảo unique (vì category là prefix). KHÔNG được có 2 key map về cùng 1
   string. Đây là khoá để filter + map label + map sang verb hiển thị.

3. **Action có phụ thuộc game không?** → **KHÔNG. Action game-agnostic.** Verb như
   `draw.void`, `draw.publish_result` dùng CHUNG cho cả 7 game; game phân biệt qua
   field `game` riêng trong doc. TUYỆT ĐỐI không tạo `keno.draw.void` hay
   `AUDIT_ACTIONS.keno.*`. Hệ quả quan trọng cho khả năng mở rộng: **thêm 1 game
   mới = 0 dòng đổi ở `AUDIT_ACTIONS`/`AuditCategory`/`AuditTargetType`** — chỉ
   thêm 1 value vào field `game`. Registry chỉ phình theo số *loại hành động*
   (tuyến tính, type-safe), KHÔNG theo số game. Đây là lý do giữ registry typed
   thay vì `action: string` tự do (mất type-safety + filter không ổn định).

Tổ chức thành **object lồng theo category**, có comment hướng dẫn mở rộng:

```typescript
/**
 * Registry toàn bộ audit action — nhóm theo {@link AuditCategory}.
 *
 * QUY TẮC mở rộng (đọc kỹ trước khi thêm):
 * 1. Value format `{category}.{verb}` — snake_case cho verb. PHẢI UNIQUE toàn cục.
 * 2. Thêm verb mới → thêm vào đúng nhóm category bên dưới (KHÔNG tạo nhóm rời rạc).
 * 3. Thêm category mới → (a) thêm vào `AuditCategory` enum, (b) tạo nhóm mới ở đây,
 *    (c) bổ sung label ở `AuditActionLabel` (§9.6 → entities/labels.ts).
 * 4. KHÔNG xoá action đã ship (log cũ vẫn tham chiếu) — chỉ deprecate qua comment.
 * 5. Mỗi action nên map tới 1 `AuditCategory` + (thường) 1 `AuditTargetType`
 *    nhất quán — xem bảng §3.2.
 */
export const AUDIT_ACTIONS = {
  /** category=draw, target=draw. Vận hành kỳ quay. */
  draw: {
    publishResult: "draw.publish_result",
    republishResult: "draw.republish_result",
    void: "draw.void",
    resettle: "draw.resettle",
    updateVietlottRef: "draw.update_vietlott_ref",
  },
  /** category=player, target=player. Quản trị tài khoản người chơi. */
  player: {
    suspend: "player.suspend",
    activate: "player.activate",
  },
  /** category=config, target=game_config|tenant. Cập nhật cấu hình. */
  config: {
    updateGlobal: "config.update_global",
    updateTenant: "config.update_tenant",
  },
  /** category=auth, target=account. Đăng nhập/đăng xuất. */
  auth: {
    login: "auth.login",
    logout: "auth.logout",
    loginFailed: "auth.login_failed",
  },
  /** category=finance, target=account. Điều chỉnh tài chính. */
  finance: {
    adjustBalance: "finance.adjust_balance",
  },
  /** category=system, target=draw. Action hệ thống tự chạy (worker). */
  system: {
    settleFinalized: "system.settle_finalized",
    voidFinalized: "system.void_finalized",
  },
} as const;

/** Union mọi giá trị action — type cho `AuditLogDoc.action`, đảm bảo chỉ nhận action hợp lệ. */
export type AuditAction =
  (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS][keyof (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS]];
```

> **Cách dùng**: `AUDIT_ACTIONS.draw.void` → `"draw.void"`. Type `AuditAction`
> ép `action` field chỉ nhận string trong registry → không thể gõ sai chính tả
> hay tự bịa action ngoài registry (compile-time guard).

### 3.2 Bảng category ↔ target ↔ action

| Category | Target mặc định | Action |
|---|---|---|
| `draw` | `draw` (drawId) | publish_result, republish_result, void, resettle, update_vietlott_ref |
| `player` | `player` (playerId) | suspend, activate |
| `config` | `game_config` / `tenant` | update_global, update_tenant |
| `auth` | `account` (accountId) | login, logout, login_failed |
| `finance` | `account` (accountId) | adjust_balance |
| `system` | `draw` (drawId) | settle_finalized, void_finalized |

---

## 4. Cấu trúc package `@megawin/audit`

Tuân thủ rule `mongodb-repository-architecture` (tách types/, repo chỉ chứa
class + query, use-case không query trực tiếp).

```
packages/audit/
├── package.json                 # exports: ./entities, ./logger, ./repos, ./use-cases, ./indexes
├── tsconfig.json
├── tsconfig.build.json
├── vitest.config.ts
├── src/
│   ├── entities/
│   │   ├── audit-log.ts          # AuditLogDoc + AuditMetadata + AuditChanges
│   │   ├── enums.ts              # AuditActorType, AuditCategory, AuditStatus, AuditTargetType, AUDIT_ACTIONS, AuditAction
│   │   ├── labels.ts             # AuditActionLabel, AuditCategoryLabel, AuditStatusLabel, AuditTargetTypeLabel (VN) — §9.6
│   │   └── index.ts
│   ├── infras/repos/
│   │   ├── audit-log-repo.ts     # AuditLogRepository extends AuditRepo (cursor-based)
│   │   ├── types/
│   │   │   ├── audit-query.types.ts   # AuditLogFilter, AuditLogCursor, AuditLogCursorPage
│   │   │   └── index.ts
│   │   └── index.ts
│   ├── logger/
│   │   ├── audit-logger.ts       # AuditLogger.record() + recordAndWait()
│   │   ├── actor.ts              # AuditActor interface + systemActor()
│   │   ├── types.ts              # AuditEventInput
│   │   └── index.ts
│   ├── use-cases/
│   │   ├── list-audit-logs.ts    # NextApiUseCase: filter + cursor paging
│   │   ├── get-audit-log.ts      # chi tiết 1 record
│   │   └── index.ts
│   └── indexes/
│       └── index.ts              # compound index + TTL
└── test/
    ├── global-setup.ts           # turbo build --filter=@megawin/audit^...
    └── use-cases/
        └── list-audit-logs.test.ts
```

> **Labels nằm trong `entities/labels.ts`** (không ở BO) — theo yêu cầu. Lý do:
> label là một phần của contract enum, tái dùng được ở BO web, email report,
> hay bất kỳ consumer nào. BO chỉ `import { AuditActionLabel } from "@megawin/audit/entities"`.

### 4.1 `package.json` (đúng convention monorepo — đã verify)

```json
{
  "name": "@megawin/audit",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "Centralized audit log — entities, repo, logger, use-cases",
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "dev": "tsc -p tsconfig.build.json --watch",
    "check-types": "tsc --noEmit",
    "build:deps": "turbo build --filter=@megawin/audit^...",
    "pretest": "pnpm build:deps",
    "test": "vitest run",
    "test:watch": "vitest --watch",
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
    "@megawin/vitest-config": "workspace:*",
    "@types/node": "^25.9.4",
    "typescript": "^6.0.3",
    "vite": "latest",
    "vitest": "^4.1.9"
  }
}
```

> `use-cases` cần `@megawin/next` (NextApiUseCase) — thêm vào dependencies khi
> làm đợt use-case (đợt 3). Tách giai đoạn để package nền compile được sớm.

### 4.2 `tsconfig.json`

```json
{
  "extends": "@megawin/typescript-config/base.json",
  "compilerOptions": { "outDir": "dist" },
  "include": ["src", "test"],
  "exclude": ["node_modules", "dist"]
}
```

### 4.3 `tsconfig.build.json`

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "rootDir": "src" },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "test"]
}
```

### 4.4 `vitest.config.ts`

```typescript
import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import { sharedConfig } from "@megawin/vitest-config/dist";

export default defineConfig(({ mode }) => ({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    env: loadEnv(mode, import.meta.dirname, ""),
    include: ["test/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    globalSetup: ["test/global-setup.ts"],
  },
}));
```

`test/global-setup.ts` copy y `game-keno-application`, đổi filter thành
`@megawin/audit^...`.

---

## 5. `AuditLogRepository`

`packages/audit/src/infras/repos/audit-log-repo.ts` — **extends `AuditRepo`**
(base có sẵn từ `@megawin/data/mongo`, đã hardcode `dbName: "megawin-audit"`,
dùng `MONGODB_URI` chung cluster — xem §1.5). Repo CHỈ truyền
`collName: "audit_logs"`.

```typescript
import { AuditRepo } from "@megawin/data/mongo";
import type { AuditLogDoc } from "../../entities";

export class AuditLogRepository extends AuditRepo<AuditLogDoc> {
  constructor() {
    super({ collName: "audit_logs" });
    // dbName "megawin-audit" đã set sẵn trong AuditRepo base.
  }
}
```

> Dùng `DefaultMongoMapper` mặc định (chỉ map `_id ↔ id`) — `AuditLogDoc` không
> có nested type cần custom mapper. KHÔNG truyền `dataMapper`.

### 5.1 Pagination: CURSOR-BASED `(ts, _id)` — không page/size

**Quyết định: cursor-based, copy pattern `tx-log-repo.ts`** (đã verify là blueprint
gần như y hệt: sort theo Date field + tie-break `_id`, range filter, TTL). Lý do:

- Audit log là time-series **append-heavy** — record mới insert liên tục. Offset
  `skip/limit` không stable (record mới chèn vào → trang lệch) và **chậm dần khi
  skip sâu** (Mongo phải scan + bỏ qua skip docs).
- Cursor `(ts, _id)` dùng index `{ ts: -1 }` → mỗi trang là 1 range scan O(limit),
  không phụ thuộc độ sâu. Đúng "tối ưu index" như bạn nói.
- Tie-break bằng `_id`: nhiều record cùng `ts` (cùng millisecond) vẫn phân trang
  deterministic, không skip/lặp.

**Cursor filter** (sort `{ ts: -1, _id: -1 }`):

```typescript
// cursor = { ts: Date; id: string } | null (null = trang đầu)
const cursorFilter = cursor
  ? {
      $or: [
        { ts: { $lt: cursor.ts } },
        { ts: cursor.ts, _id: { $lt: new ObjectId(cursor.id) } },
      ],
    }
  : {};
```

Methods (mỗi public method PHẢI có JSDoc theo rule `mongodb-repository-architecture`):
- `insertAudit(doc: AuditLogDoc): Promise<string>` — ghi 1 record (wrap `insertOne`).
- `listByCursor(filter: AuditLogFilter, cursor, limit): Promise<AuditLogCursorPage>` —
  build mongoFilter từ `filter` + `cursorFilter`, `findMany(..., { sort: { ts: -1, _id: -1 }, limit: limit + 1 })`,
  lấy `limit + 1` để tính `hasMore`, slice về `limit`, build `nextCursor` từ
  record cuối. **KHÔNG gọi `count()`** (cursor không cần total — bỏ luôn chi phí
  count tốn kém trên collection lớn).
- `getById(id: string): Promise<AuditLogDoc | null>` — wrap `findOneById`.
- `ensureIndexes(): Promise<void>` — tạo index (đợt indexes).

Query types tại `infras/repos/types/audit-query.types.ts`:
```typescript
export interface AuditLogFilter {
  from?: Date;            // đã convert UTC từ toVNStartOfDay ở use-case
  to?: Date;              // đã convert UTC từ toVNEndOfDay ở use-case
  actorId?: string;
  actorType?: AuditActorType;
  tenantId?: string;
  game?: string;
  category?: AuditCategory;
  action?: AuditAction;
  targetType?: AuditTargetType;
  targetId?: string;
  status?: AuditStatus;
}

/** Cursor compound (ts, _id) — encode HTTP thành "{iso}|{id}". */
export interface AuditLogCursor {
  ts: Date;
  id: string;
}

export interface AuditLogCursorPage {
  data: AuditLogDoc[];
  /** Cursor cho trang kế. null nếu hết. */
  nextCursor: AuditLogCursor | null;
}
```

> `from`/`to` build thành `{ ts: { $gte: from, $lte: to } }` trong mongoFilter,
> gộp với `cursorFilter` qua `$and` nếu cả hai cùng tác động `ts`.

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
điền `new Date()` (**UTC**, KHÔNG cộng offset), `status` mặc định `success`,
`id` tự sinh. `metadata` nhận `AuditMetadata` (http/worker/extra — §2.4). Logger
map sang doc đầy đủ rồi `insertAudit`.

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

### 8.1. Pattern thô (low-level)

Pattern thô gọi trực tiếp `AuditLogger.record()` — đầy đủ field, dùng khi cần
kiểm soát hết. Ví dụ trong `VoidDrawUseCase.execute`:

```typescript
import { AuditLogger } from "@megawin/audit/logger";
import { AUDIT_ACTIONS, AuditCategory, AuditTargetType } from "@megawin/audit/entities";

// input.actor: AuditActor — thread từ route. Worker tự chạy → systemActor().
// ... sau khi void thành công ...
AuditLogger.record({
  actorId: input.actor.id,
  actorType: input.actor.type,
  actorName: input.actor.name,
  actorRoles: input.actor.roles,
  tenantId: input.actor.tenantId,
  action: AUDIT_ACTIONS.draw.void,         // registry mới: nhóm theo category
  category: AuditCategory.Draw,
  game: "bingo18",
  targetType: AuditTargetType.Draw,
  targetId: input.drawId,
  targetLabel: `Kỳ ${input.drawId}`,
  changes: { before: { status: draw.status }, after: { status: "voiding" } },
  metadata: { extra: { reason: input.reason } },
});
```

→ Vấn đề: gọi thô **quá dài**, lặp 13 field ở mọi use-case, dễ quên field, dễ
set sai `category`/`targetType` lệch với `action`. Đây chính là lý do cần §8.2.

### 8.2. Game-specific helper — gọi audit GỌN (giải pháp cho câu hỏi)

**Quyết định: mỗi game viết 1 helper audit riêng** đặt tại
`packages/game-{game}-application/src/audit/{game}-audit.ts`. Helper là **nhóm
free functions** (KHÔNG class, KHÔNG object literal, KHÔNG suffix `Service` — để
tránh nhầm với class `*Service` trong `services/`). Helper:
- **Đóng băng** các field cố định của game (`game`, `category`, `targetType`,
  `action`) → use-case không phải nhớ.
- Chỉ nhận **payload nghiệp vụ tối thiểu** (actor + id + diff) → ngắn gọn.
- Tự build `targetLabel`, `changes`, `metadata.extra` theo convention của game.

```typescript
// packages/game-bingo18-application/src/audit/audit-actions.ts
import { AuditLogger, type AuditActor } from "@megawin/audit/logger";
import { AUDIT_ACTIONS, AuditCategory, AuditTargetType } from "@megawin/audit/entities";

const GAME = "bingo18";

/** Audit hành động void kỳ bingo18 — chỉ truyền actor + drawId + lý do. */
export function auditDrawVoid(args: {
  actor: AuditActor;
  drawId: string;
  prevStatus: string;
  reason?: string;
}): void {
  AuditLogger.record({
    ...actorFields(args.actor),
    action: AUDIT_ACTIONS.draw.void,
    category: AuditCategory.Draw,
    game: GAME,
    targetType: AuditTargetType.Draw,
    targetId: args.drawId,
    targetLabel: `Kỳ ${args.drawId}`,
    changes: { before: { status: args.prevStatus }, after: { status: "voiding" } },
    metadata: { extra: { reason: args.reason } },
  });
}

/** Audit công bố kết quả — payload đặc thù publish (numbers, drawNo). */
export function auditPublishResult(args: {
  actor: AuditActor;
  drawId: string;
  drawNo: number;
  numbers: number[];
}): void {
  AuditLogger.record({
    ...actorFields(args.actor),
    action: AUDIT_ACTIONS.draw.publishResult,
    category: AuditCategory.Draw,
    game: GAME,
    targetType: AuditTargetType.Draw,
    targetId: args.drawId,
    targetLabel: `Kỳ ${args.drawId} (#${args.drawNo})`,
    metadata: { extra: { drawNo: args.drawNo, numbers: args.numbers } },
  });
}

/** Helper nội bộ: spread 5 field actor → DRY giữa các hàm audit. */
function actorFields(a: AuditActor) {
  return {
    actorId: a.id,
    actorType: a.type,
    actorName: a.name,
    actorRoles: a.roles,
    tenantId: a.tenantId,
  };
}
```

**Trong use-case publish-result → chỉ 1 dòng:**

```typescript
// PublishResultUseCase.execute — sau khi publish thành công
auditPublishResult({
  actor: input.actor,
  drawId: input.drawId,
  drawNo: draw.drawNo,
  numbers: result.numbers,
});
```

→ Use-case publish-result KHÔNG phình ra vì audit. Toàn bộ ánh xạ
`action`/`category`/`targetType`/`label`/`metadata` đóng gói trong helper,
test riêng được, sửa 1 chỗ áp dụng mọi use-case của game đó.

> **Phân tầng rõ**: `@megawin/audit/logger` cung cấp `AuditLogger.record()`
> (low-level, generic). Mỗi game cung cấp helper `audit*()` (high-level, đóng
> băng context game). Use-case chỉ gọi helper. Đây là DRY + KISS đúng tinh thần
> rule code-quality: tránh truyền nhiều param, không lặp mapping ở mọi use-case.

**Vị trí helper** `packages/game-{game}-application/src/audit/` (cạnh use-cases,
cùng package) — vì helper phụ thuộc domain type của game (drawNo, status enum...).
KHÔNG đặt trong `@megawin/audit` (sẽ tạo dependency ngược audit → game).

> `metadata.http`/`metadata.worker` (ip/userAgent/requestId/executionId) lấy ở
> **tầng route/worker**, thread qua input DTO bên cạnh `actor` (vd
> `requestMeta?: AuditHttpContext`). Helper nhận optional `meta` rồi gắn vào
> `metadata.http`. `void-draw` hiện có `voidedBy` (string) — đợt tích hợp
> thay/bổ sung bằng `actor: AuditActor`, đồng thời **chuẩn hóa cách set giữa
> 7 game** (xem §1.4).

Action target tích hợp ban đầu (đợt 4): `void-draw`, `publish-result`,
`update-game-config` cho 1-2 game làm chuẩn mực (kèm helper mẫu), sau nhân rộng.

---

## 9. UI/UX trên BO web (đợt 5) — trang riêng + tích hợp embedded

Stack BO (đã verify): **Next.js 16 App Router + React 19 (React Compiler) +
React Query v5 + nuqs v2 (URL state) + radix/shadcn UI + TanStack Table v8**.
KHÔNG dùng SWR. KHÔNG i18n (string tiếng Việt hardcode). Gọi API qua `apiClient`
(`@megawin/next/client`).

### 9.1 API route

`apps/backoffice/src/app/api/audit-logs/route.ts`:

```typescript
export const GET = withApi()
  .auth({ roles: [CompanyRole.Admin] })   // Admin bypass; chỉ Admin xem audit
  .query(listAuditLogsQuerySchema)          // zod v4: from,to,actorId,actorType,
                                            // tenantId,game,category,action,
                                            // targetType,targetId,status,
                                            // cursor (string "{iso}|{id}"), limit
  .handler(async ({ query }) => listAuditLogsUseCase.run(query));
```

`listAuditLogsUseCase` (NextApiUseCase): parse `cursor` string → `{ ts, id }`
(degrade-to-null nếu sai, KHÔNG throw), convert `from`/`to` (YYYY-MM-DD) →
UTC boundary qua `toVNStartOfDay`/`toVNEndOfDay`, gọi `repo.listByCursor()`,
trả `{ data, nextCursor: "{iso}|{id}" | null }`.

`apps/backoffice/src/app/api/audit-logs/[id]/route.ts` → `getAuditLogUseCase.run({ id })`.

### 9.2 Deep-link resolver — `audit-target-link.ts`

Đây là **trái tim của yêu cầu "link xem trực tiếp"**. Một hàm pure map audit
record → URL nội bộ BO. Đặt tại `apps/backoffice/src/app/(main)/audit-logs/_lib/`.

```typescript
import type { AuditLogDoc } from "@megawin/audit/entities";

/**
 * Resolve URL deep-link tới đối tượng của audit record.
 * Trả `null` nếu không có trang đích (chỉ hiển thị label tĩnh).
 *
 * URL pattern (đã verify từ codebase):
 * - draw   → /games/{game}/operations?draw={drawId}   (drawId: YYYY-MM-DD.NNN)
 * - player → /accounts/players/{accountId}/overview
 * - game_config → /games/{game}/config/game
 * - tenant → /tenants
 * - account → null (chưa có detail route)
 */
export function resolveAuditTargetLink(log: AuditLogDoc): string | null {
  switch (log.targetType) {
    case "draw":
      return log.game && log.targetId
        ? `/games/${log.game}/operations?draw=${log.targetId}`
        : null;
    case "player":
      return log.targetId
        ? `/accounts/players/${log.targetId}/overview`
        : null;
    case "game_config":
      return log.game ? `/games/${log.game}/config/game` : null;
    case "tenant":
      return "/tenants";
    default:
      return null;
  }
}
```

> **Vì sao trang chi tiết kỳ quay là `operations?draw=...`**: BO KHÔNG có route
> `/games/[game]/draws/[drawId]`. Trang `operations` đọc `?draw=` qua nuqs
> (`use-draw-context.tsx`) và hiển thị chi tiết kỳ. Click draw-history-row ở
> game cũng push đúng URL này. Audit deep-link tái dùng y hệt → không tạo route
> mới, không lệch UX.

### 9.3 Trang riêng `/(main)/audit-logs` — layout & cấu trúc file

```
apps/backoffice/src/app/(main)/audit-logs/
├── page.tsx                       # Server component: header gradient + <Suspense>
├── _components/
│   ├── audit-logs-content.tsx     # "use client": nuqs filter + React Query fetch
│   ├── audit-logs-filter-bar.tsx  # khoảng ngày, actor, game, category, action, status
│   ├── audit-logs-table.tsx       # <Table> ui + cột + row click → Sheet
│   ├── audit-log-detail-sheet.tsx # Sheet side=right: diff before/after + metadata + deep-link
│   └── columns.tsx                # ColumnDef<AuditLogRow>[]
├── _lib/
│   ├── queries.ts                 # useAuditLogs(filter) — React Query infinite/cursor + apiClient
│   └── audit-target-link.ts       # resolveAuditTargetLink (§9.2)
```

> Labels KHÔNG còn ở BO `_lib/labels.ts` — đã chuyển vào `@megawin/audit/entities`
> (§9.6). BO import: `import { AuditActionLabel } from "@megawin/audit/entities"`.

**Cột bảng** (Thời gian | Actor | Hành động | Đối tượng | Kết quả):

| Cột | Nội dung |
|---|---|
| Thời gian | `displayVNDateTime(ts)` từ `@megawin/shared/utils/date` |
| Actor | `actorName` + badge `actorType` (company/agent/system) + roles tooltip |
| Hành động | `AuditActionLabel[action]` + badge `category` |
| Đối tượng | `targetLabel` → nếu `resolveAuditTargetLink()` ≠ null thì bọc `<Link prefetch={false}>` (icon external) |
| Kết quả | badge `success`/`failure` (đỏ nếu failure + `errorCode`) |

**Row click** → mở `<Sheet side="right">` (component `sheet.tsx` có sẵn):
- Header: action label + thời gian + actor.
- Body: **diff before/after** — so sánh `changes.before` vs `changes.after`,
  key nào khác tô vàng. Dùng `<pre>` JSON cho object phức tạp.
- Metadata: hiển thị nhánh `http` (ip/userAgent/method/path/requestId) HOẶC
  `worker` (workerName/executionId/trigger) tùy nguồn, cộng `extra`.
- Footer: **nút "Xem đối tượng →"** dùng `resolveAuditTargetLink()` (ẩn nếu null).

**Filter** (nuqs `useQueryStates`, `history: "push"`, đẩy hết vào URL → share
được link filter):
- Khoảng ngày `from`/`to` (default 7 ngày gần nhất qua `subDays/todayVN`).
- `actorId` (text), `actorType` (select), `game` (select 7 game + "tất cả"),
  `category` (select), `action` (select theo category đã chọn), `status` (select).
- `targetId` (text) — để tra cứu "mọi thao tác trên kỳ X / player Y".
- Đổi filter → reset cursor về null (về trang đầu).

**Fetch** (`_lib/queries.ts`) — cursor-based qua `useInfiniteQuery`:

```typescript
export function useAuditLogs(filter: AuditLogFilter) {
  return useInfiniteQuery({
    queryKey: auditKeys.list(filter),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams(/* filter + cursor=pageParam */);
      return apiClient.get<AuditLogCursorPage>(`/audit-logs?${params}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined, // "{iso}|{id}"
  });
}
```

Phân trang UI: nút **"Tải thêm"** (load-more) gọi `fetchNextPage()` — đúng mô
hình cursor "load tiếp" bạn đề xuất, không hiển thị tổng số trang (cursor không
đếm total). Hoặc infinite scroll nếu muốn.

### 9.4 Deep-link & embedded — 2 phương án + khuyến nghị

Bạn nêu 2 hướng. Phân tích cả hai về UI/UX + performance:

**Phương án A — Link sang trang `/audit-logs` đã pre-fill filter (nuqs).**
Từ trang vận hành / game config, đặt nút "Xem lịch sử thao tác" → điều hướng
sang `/audit-logs?targetType=draw&game=keno&targetId=2026-03-07.095`. nuqs đọc
query param → filter tự điền → list đúng. Đây chính là chiều "Xem tất cả" ở §9.4
embedded.

| | Phương án A |
|---|---|
| UI/UX | Rời context (chuyển trang). Nhưng vào đúng trang chuyên dụng đầy đủ filter, share link được. |
| Performance | Nhẹ — chỉ 1 trang audit, không nhúng query vào trang vận hành (vốn đã nặng). |
| Code | Đơn giản nhất: 1 trang + resolver build URL. KHÔNG cần partial/dialog. |

**Phương án B — Dialog render partial filter NGAY tại trang vận hành.**
Mở dialog/sheet ngay trên trang draw, nhúng mini-list audit của kỳ đó (Next.js
parallel/intercepting route hoặc client component gọi API).

| | Phương án B |
|---|---|
| UI/UX | Giữ context (không rời trang). Tốt khi chỉ liếc nhanh vài dòng. |
| Performance | Trang vận hành phải tải thêm query audit (dù lazy). Phức tạp nếu dùng intercepting route. |
| Code | Phức tạp hơn: component nhúng + fail-soft + tránh vỡ trang chủ. |

**Khuyến nghị: LÀM CẢ HAI, theo vai trò khác nhau** (đây là điều §9.4 đang mô tả,
nay làm rõ):

1. **Embedded panel nhẹ (Phương án B rút gọn)** — `AuditTimelinePanel` nhúng sẵn
   trên trang đối tượng, hiển thị **5-10 dòng gần nhất** (read-only, lazy, fail-
   soft). Đủ để xem nhanh "kỳ này ai vừa thao tác gì". KHÔNG làm full filter ở
   đây (tránh nặng trang). Dùng `useAuditLogs` khoá `targetType + targetId`,
   `limit: 10`, không load-more.

2. **Link "Xem tất cả" (Phương án A)** — panel có nút điều hướng sang
   `/audit-logs` pre-fill filter qua URL. Ai cần lọc sâu / share link / xem diff
   chi tiết → sang trang chuyên dụng.

→ Không dùng intercepting route (overkill cho nhu cầu này, tăng phức tạp). Embed
nhẹ + link sang trang đầy đủ là cân bằng tốt nhất UI/UX ↔ performance ↔ độ phức
tạp code. **Deep-link 2 chiều**: trang riêng → "Xem đối tượng" → trang đối tượng;
trang đối tượng → "Xem tất cả" → trang riêng pre-filter.

**Component tái dùng** `AuditTimelinePanel` (đặt cạnh trang audit-logs, export
để các trang khác import):

```typescript
/**
 * Panel timeline audit gọn cho trang chi tiết đối tượng (Phương án B rút gọn).
 * Khoá filter targetType + targetId; hiển thị `limit` dòng gần nhất + link
 * "Xem tất cả" → /audit-logs?targetType=...&targetId=... (Phương án A).
 * Read-only, lazy, fail-soft — KHÔNG vỡ trang chủ nếu audit API lỗi.
 */
export function AuditTimelinePanel(props: {
  targetType: AuditTargetType;
  targetId: string;
  game?: string;
  limit?: number;   // mặc định 10
}): ReactNode;
```

**Điểm nhúng đề xuất:**

| Trang | Vị trí nhúng | Filter |
|---|---|---|
| `/games/{game}/operations?draw={id}` | Tab/section "Lịch sử thao tác kỳ" dưới chi tiết kỳ | `targetType=draw, game, targetId=drawId` |
| `/games/{game}/config/game` | Cuối trang config | `targetType=game_config, game` |
| `/accounts/players/{accountId}/overview` | Card "Hoạt động quản trị" | `targetType=player, targetId=accountId` |

> Embedded panel **read-only, fail-soft**: nếu API lỗi (vd `megawin-audit` chưa
> sẵn sàng) → empty state nhẹ, KHÔNG vỡ trang đối tượng.

### 9.5 Sidebar

Thêm vào `apps/backoffice/src/navigation/sidebar/sidebar-items.ts`. Tạo group
mới "Hệ thống" (hoặc thêm vào group cuối) — `icon: History` đã import sẵn,
`roles: [CompanyRole.Admin]`:

```typescript
{
  id: 6,
  label: "Hệ thống",
  roles: [CompanyRole.Admin],
  items: [
    {
      title: "Lịch sử thao tác",
      url: "/audit-logs",
      icon: History,
      roles: [CompanyRole.Admin],
    },
  ],
},
```

`nav-main.tsx` tự lọc theo role qua `hasAnyRole`. Server-side `(main)/layout.tsx`
đã chặn non-company; API route đã `.auth({ roles: [Admin] })` → 3 lớp bảo vệ.

### 9.6 Labels (VN) — `@megawin/audit/entities/labels.ts`

**Đặt TRONG package `@megawin/audit`** (không ở BO) theo yêu cầu. Label là một
phần contract của enum → tái dùng ở BO web, email report, hay consumer khác.
File `packages/audit/src/entities/labels.ts`, export qua `entities/index.ts`:

```typescript
import { AuditCategory, AuditStatus, AuditTargetType, AUDIT_ACTIONS } from "./enums";
import type { AuditAction } from "./enums";

/** Nhãn tiếng Việt cho từng action — key là value của AUDIT_ACTIONS. */
export const AuditActionLabel: Record<AuditAction, string> = {
  [AUDIT_ACTIONS.draw.publishResult]: "Công bố kết quả kỳ",
  [AUDIT_ACTIONS.draw.republishResult]: "Công bố lại kết quả",
  [AUDIT_ACTIONS.draw.void]: "Huỷ kỳ quay",
  [AUDIT_ACTIONS.draw.resettle]: "Tính lại kỳ",
  [AUDIT_ACTIONS.draw.updateVietlottRef]: "Cập nhật tham chiếu Vietlott",
  [AUDIT_ACTIONS.player.suspend]: "Khoá người chơi",
  [AUDIT_ACTIONS.player.activate]: "Mở khoá người chơi",
  [AUDIT_ACTIONS.config.updateGlobal]: "Cập nhật cấu hình game",
  [AUDIT_ACTIONS.config.updateTenant]: "Cập nhật cấu hình tenant",
  [AUDIT_ACTIONS.auth.login]: "Đăng nhập",
  [AUDIT_ACTIONS.auth.logout]: "Đăng xuất",
  [AUDIT_ACTIONS.auth.loginFailed]: "Đăng nhập thất bại",
  [AUDIT_ACTIONS.finance.adjustBalance]: "Điều chỉnh số dư",
  [AUDIT_ACTIONS.system.settleFinalized]: "Hoàn tất tính thưởng",
  [AUDIT_ACTIONS.system.voidFinalized]: "Hoàn tất huỷ kỳ",
};

export const AuditCategoryLabel: Record<AuditCategory, string> = {
  draw: "Kỳ quay",
  player: "Người chơi",
  config: "Cấu hình",
  auth: "Xác thực",
  finance: "Tài chính",
  system: "Hệ thống",
};

export const AuditStatusLabel: Record<AuditStatus, string> = {
  success: "Thành công",
  failure: "Thất bại",
};

export const AuditTargetTypeLabel: Record<AuditTargetType, string> = {
  draw: "Kỳ quay",
  player: "Người chơi",
  game_config: "Cấu hình game",
  account: "Tài khoản",
  tenant: "Tenant",
};
```

> `Record<AuditAction, string>` ép **mọi action phải có label** (compile-time):
> thêm action mới vào `AUDIT_ACTIONS` mà quên label → TypeScript báo lỗi. Đây là
> lý do nữa để label sống cạnh enum, không tách ở BO.

---

## 10. Kế hoạch triển khai theo đợt

> **Bỏ Đợt 0** (sửa `AuditRepo` base): không cần `mongoEnvKey` vì dùng chung
> cluster Atlas (§1.5). `AuditRepo` hiện tại đã đúng.

| Đợt | Nội dung | Output |
|---|---|---|
| **1** | Package nền: `package.json`, tsconfig (+ build), vitest config, entities (AuditLogDoc + AuditMetadata + enums + AuditTargetType + AUDIT_ACTIONS + labels), `AuditLogRepository extends AuditRepo` (cursor) + query types, indexes | Package compile, repo cursor sẵn sàng |
| **2** | `AuditLogger` (record fire-and-forget + recordAndWait) + AuditEventInput + `AuditActor`/`systemActor` (logger/actor.ts) | Logger + actor contract dùng được |
| **3** | `ListAuditLogsUseCase` (cursor: parse cursor, convert from/to UTC) + `GetAuditLogUseCase` (NextApiUseCase) | Use-case query cursor |
| **4** | Factory `actorFromAuthContext`/`actorFromSession` (adapter) + mở rộng input `actor: AuditActor` + **game helper** `audit*()` (§8.2) + gọi trong 2-3 use-case mẫu (void, publish-result, update-game-config). Chuẩn hóa actor giữa 7 game | Pattern thread actor + helper chuẩn mực |
| **5a** | API route `audit-logs` (cursor) + `audit-logs/[id]` + trang BO riêng (table + filter + Sheet diff + load-more) + `resolveAuditTargetLink` + sidebar item | Trang audit riêng + deep-link ra đối tượng |
| **5b** | `AuditTimelinePanel` nhúng vào trang kỳ quay / config / player (deep-link 2 chiều) | Xem log tại chỗ trên trang đối tượng |
| **6** | Script tạo indexes trên Atlas DB `megawin-audit` (cùng cluster) | Production-ready |

> **Đợt hiện tại được duyệt code**: **Đợt 1 + Đợt 2** (package nền + repo cursor +
> logger + actor). Các đợt sau chờ duyệt riêng.

---

## 11. Env & hạ tầng cần chuẩn bị (thủ công, ngoài code)

- **KHÔNG cần env mới** — dùng chung `MONGODB_URI` hiện tại (cùng cluster Atlas),
  chỉ khác `dbName: "megawin-audit"` (đã hardcode trong `AuditRepo`). DB sẽ tự
  tạo khi insert record đầu tiên.
- Chạy script tạo indexes (đợt 6) trên DB `megawin-audit`: compound index theo
  §7 + TTL `{ ts: 1 }` `expireAfterSeconds = 90 * 86400`.
- TTL background task của Mongo chạy ~60s/lần → record quá 90 ngày tự xoá.

> Nếu **tương lai** cần tách cluster riêng cho audit: thêm `MONGODB_AUDIT_URI`
> (SSM + `.env.local`) + 1 dòng `mongoEnvKey` trong `AuditRepo` (§1.5). Agent
> KHÔNG tạo/sửa `.env*` — hướng dẫn user tự thêm.

---

## 12. Nguyên tắc xuyên suốt

1. **Fire-and-forget**: audit KHÔNG làm chậm/fail business logic.
2. **Một điểm vào (low-level)**: mọi nơi cuối cùng gọi `AuditLogger.record()`.
   Use-case gọi qua **game helper** `audit*()` (§8.2) để gọn, không truyền nhiều param.
3. **Schema phẳng + index**: mọi chiều query là field top-level có index. Field
   filter dùng sentinel `""` (không `null`/`undefined`) — index đồng nhất (§2.1).
4. **DRY/KISS**: tái dùng `AuditRepo`/`MongoRepository`, không tự viết Mongo client.
5. **Tách DB logic**: `megawin-audit` riêng DB (chung cluster) → dễ backup/TTL/drop
   riêng, không lẫn DB nghiệp vụ. Tách cluster để sau (§1.5).
6. **Action registry unique**: dùng `AUDIT_ACTIONS` (nhóm theo category, value
   unique, type `AuditAction`), không hardcode string rải rác. Label cạnh enum.
7. **Một contract actor**: use-case chỉ nhận `AuditActor` (không nhận `AuthContext`/
   `RouteSession` thô). Map ở tầng route qua factory; worker dùng `systemActor()`.
8. **UTC lưu, VN hiển thị**: `ts` luôn UTC. Convert VN→UTC ở input filter, UTC→VN
   ở display. KHÔNG lưu giờ VN vào DB (§2.3).
9. **Cursor-based**: list audit dùng cursor `(ts, _id)`, không page/size — tối ưu
   index, stable với append-heavy (§5.1).