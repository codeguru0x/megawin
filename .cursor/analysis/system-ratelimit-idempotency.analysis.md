# System — Rate Limiting & Idempotency (Defensive Layer)

| | |
|---|---|
| **Status** | `discussing` |
| **Ngày** | 2026-09-20 |
| **Phạm vi** | `apps/api-player` (7 game × ~10 endpoint), `apps/api-tenant` (**3** endpoint deployed — xem §4.2), mở rộng `apps/backoffice` + operator sau |
| **Nguồn tham chiếu** | `docs/cache/04-ap-dung-use-case-va-roadmap.md` §Phase 3 · `.cursor/rules/cache-design.mdc` · `.cursor/rules/app-use-case-layering.mdc` · `.cursor/rules/error-handling-conventions.mdc` |
| **Trigger** | `docs/cache/04` §Phase 3 ghi rõ điều kiện khởi động L2 Redis: *"Cần distributed lock / rate-limit / idempotency key"*. Doc này **chính là** trigger đó. |

---

## 1. Bối cảnh & mục tiêu

Hệ thống hiện **không có bất kỳ lớp phòng thủ nào** ở tầng application cho 2 nhóm rủi ro:

1. **Duplicate request trên đường tiền** — player double-tap "Đặt cược", hoặc app tenant tự retry khi
   timeout, tạo ra **2 vé + 2 lần debit ví thật**. Không có cơ chế nào chặn.
2. **Abuse volumetric** — brute-force `player-login`, spam `place-bet`, poll `entry-feed` không giới hạn.

Mục tiêu của doc: chốt **một** lớp phòng thủ dùng chung, hook được vào mọi handler Lambda hiện có và
tương lai, với **chi phí latency tối thiểu trên hot path** (place-bet) và **không tạo điểm chết mới**
(Redis down không được làm sập đặt cược).

Ràng buộc bắt buộc tôn trọng:

- `docs/cache/04` §"Những nơi tuyệt đối KHÔNG cache" — `place-bet` validate draw realtime, balance
  callbacks, WAL/TxIntent. Lớp phòng thủ **không được** biến thành cache cho các đường này.
- Handler phải mỏng (`app-use-case-layering.mdc` §1) → phòng thủ thuộc **middleware**, không nhét vào
  use-case.
- Message lỗi trả client là UI (`error-handling-conventions.mdc`) → không lộ chi tiết kỹ thuật.

---

## 2. Hiện trạng (đã đọc code, không phỏng đoán)

### 2.1. Điểm hook duy nhất — `buildHandler()`

`packages/auth/src/handler-wrappers.ts:98-109` là **cửa ngõ duy nhất** của mọi Lambda handler trong
`api-player` + `api-tenant`:

```
auth (optional) → validatorZodMiddleware → successEnvelopeMiddleware → httpErrorHandlerUseCaseFormat
```

Cả 5 wrapper (`withPlayerAuth`, `withAgentAuth`, `withCompanyAuth`, `withPublicHandler`,
`withTenantAuth` ở `packages/auth/src/tenant/with-tenant-auth.ts:20-28`) đều đi qua đây. **Sửa 1 chỗ
= phủ toàn bộ ~76 endpoint hiện có và mọi endpoint tương lai.** Đây là tài sản kiến trúc quan trọng
nhất cho task này.

### 2.2. Rate limit: KHÔNG tồn tại

Grep toàn repo `rate.?limit|throttl` (loại docs/plans/lock): chỉ **1 match** và là JSDoc ví dụ tại
`packages/cache/src/redis/repository.ts:13-17`. Comment ở `handler-wrappers.ts:149` nói *"handler vẫn
đọc được `sourceIp`… cho rate-limit/log"* — tức đã dự tính nhưng **chưa implement**.

Tầng AWS cũng chưa có gì riêng: `apps/api-player/serverless.yml` không khai `throttle`, không có WAF,
không `reservedConcurrency`.

### 2.3. Idempotency: có WAL nhưng KHÔNG chặn duplicate submit

Đây là phần dễ hiểu sai nhất, cần phân biệt rạch ròi 2 việc:

| | Cơ chế hiện có | Bảo vệ được gì | KHÔNG bảo vệ được gì |
|---|---|---|---|
| `tx_intents` WAL | unique `{tx}` — `packages/game-core/src/indexes/index.ts:136-139` | **Crash recovery**: Lambda chết giữa debit và save → scheduler tự heal | Duplicate **submit** từ client |
| Tenant debit API | `tx` là idempotency key; tenant trả `duplicate: true` — `packages/tenant-gateway/src/transaction/types.ts:127,280` | MegaWin retry cùng `tx` không double-debit | Hai `tx` **khác nhau** = 2 giao dịch hợp lệ |
| Ticket collection | unique `{accountId, ticketNo}` — `packages/game-keno/src/indexes/index.ts:70-74` | Trùng `ticketNo` | `ticketNo` từ counter tăng dần → 2 request = 2 số khác → **không chặn** |

**Gốc rễ vấn đề:** `tx` **luôn sinh server-side**, mỗi lần gọi một giá trị mới —
`packages/game-keno-application/src/use-cases/place-bet/place-bet.ts:157` gọi
`DebitPlayerService.generateTx()` (`packages/game-core-application/src/services/debit-player-service.ts:175-177`
→ `generateId()` = UUIDv7). Client **không có đường nào** truyền idempotency key vào: Zod body schema
chỉ nhận `drawIds` + `boards` (`apps/api-player/src/handlers/keno/place-bet.ts:131-147`), DTO
`PlaceBetInput` không có field `tx`.

→ **2 request giống hệt nhau = 2 `tx` khác nhau = 2 vé + 2 lần trừ tiền. Mọi lớp bảo vệ hiện có đều
cho qua.** Đây là bug tài chính đang mở, không phải rủi ro lý thuyết.

### 2.4. Mức độ thực tế của rủi ro duplicate

- `packages/player-sdk/src/http-client.ts` **không** auto-retry (chỉ `timeout` 30s, dòng `110`,`142`).
  → Duplicate **không** đến từ SDK.
- Nhưng: timeout 30s < Lambda timeout 29s + API GW overhead → có **cửa sổ thật** mà request đã
  thành công phía server nhưng client nhận timeout. Tenant bọc retry quanh SDK (rất phổ biến) hoặc
  user bấm lại → duplicate.
- `packages/http-client/src/retry.ts:44` cho thấy convention retry **của chính repo này** mặc định
  retry status `[0, 408, 429, 502, 503, 504]` — trong đó `0` = network error/timeout. Tức tenant
  engineer đọc code repo sẽ thấy retry-on-timeout là chuẩn mực. Rủi ro là **có hệ thống**.

### 2.5. Redis: hạ tầng đã sẵn, nhưng chưa dùng như Redis thật

- `REDIS_URI` **đã** khai trong `apps/api-player/serverless.yml` (`provider.environment`, lấy từ SSM).
- **Không app nào có `vpc:` config** (grep `apps/*/serverless.yml` → không match) → Lambda chạy ngoài
  VPC → Redis hiện tại **phải là endpoint public** (Upstash / Redis Cloud). Đây là ràng buộc latency
  quan trọng: mỗi round-trip là qua internet, không phải trong VPC.
- `packages/cache` có 2 tầng: `RedisRepository` (fail-fast, throw) và `RedisCacheStore` (fail-open).
- **Chưa có consumer Redis thật nào** — grep `getRedisClient|RedisRepository` chỉ khớp trong
  `packages/cache` + test. Redis chỉ đến gián tiếp qua `getDefaultCacheStore()`
  (`packages/cache/src/stores/default-store.ts:40-59`), và chỉ bật khi có env.
- `RedisRepository` **thiếu `eval`/`evalSha`/`scriptLoad`** → chưa làm được atomic multi-step.
  Đã verify `redis@6.2.1` **có đủ** `EVAL`, `EVALSHA`, `SCRIPT_LOAD` trong
  `node_modules/.pnpm/@redis+client@6.2.1/.../commands/` → chỉ cần expose thêm method.
- `@megawin/cache` **không** nằm trong `dependencies` của `apps/api-player/package.json` (chỉ đến
  transitively qua `game-*-application`).

### 2.6. Error code: đã có sẵn, dùng lại được

| Code | Khai ở | Status map |
|---|---|---|
| `TOO_MANY_REQUESTS` | `packages/shared/src/errors/error-codes.ts:26` | ✅ 429 — `http-status.ts:32` |
| `IDEMPOTENCY_CONFLICT` | `error-codes.ts:58` | ⚠️ **chưa map** → rơi về default 400 (`http-status.ts:50`) |

`AppException.tooManyRequests()` đã có (`app-exception.ts:112-117`). **Không cần tạo code mới** —
chỉ cần bổ sung mapping cho `IDEMPOTENCY_CONFLICT` (đề xuất 409).

### 2.7. Chặn quan trọng: không gắn được header `Retry-After` qua `throw`

`httpErrorHandlerUseCaseFormat` (`packages/app-core/src/lambda/middleware/http-error-handler-use-case.ts`)
hard-code `JSON_HEADERS = { "Content-Type": "application/json" }`. Throw `AppException.tooManyRequests()`
→ client nhận 429 **không có `Retry-After`**.

Hai đường ra, cả hai đều có tiền lệ trong repo:

1. **Middleware tự set `request.earlyResponse`** (tiền lệ: `validatorZodMiddleware` →
   `buildValidationResponse`, `validator-zod.ts:86-100`) — toàn quyền headers, short-circuit không
   chạy handler. **Khuyến nghị dùng cách này.**
2. Mở rộng error handler đọc `details.retryAfterSec` → thêm header. Xâm lấn hơn, ảnh hưởng mọi lỗi.

Lưu ý phối hợp: `withRetry` của repo (`retry.ts:187-189`) dùng exponential backoff **và không đọc
`Retry-After`**. Nên `Retry-After` là tín hiệu cho client bên ngoài, không phải cho `@megawin/http-client`.

---

## 3. Phân tích

### 3.1. Kiến trúc 4 tầng — mỗi tầng chặn một loại tấn công khác nhau

Không tầng nào thay thế được tầng khác. Xếp theo thứ tự request đi qua:

| Tầng | Chặn gì | Chi phí | Trạng thái |
|---|---|---|---|
| **L0 — AWS edge** (WAF rate-based / API GW throttle) | Flood volumetric, DDoS L7. Chặn **trước** khi tốn Lambda invocation | ~$5–10/tháng WAF; throttle = $0 | Chưa có |
| **L1 — Rate limit app** (Redis) | Abuse **theo identity** (player/tenant/IP) và theo route. WAF không biết `accountId` | 1 Redis RTT | Chưa có |
| **L2 — Idempotency** | Duplicate submit trên đường tiền | 0–2 RTT (xem §3.3) | Chưa có |
| **L3 — DB unique index** | Backstop cuối — race mà L1/L2 lọt | $0 (đã có) | Có phần (§2.3) |

**Điểm mấu chốt:** L0 rẻ nhất nhưng thô nhất (không biết identity); L1 tinh nhưng tốn RTT. Cả hai
đều **không** giải quyết duplicate — duplicate cần L2/L3 vì 2 request duplicate là 2 request *hợp lệ*
dưới mắt rate limiter.

### 3.2. So sánh thuật toán rate limit

| Thuật toán | Redis ops | Bộ nhớ/key | Burst boundary | Nhận xét cho repo này |
|---|---|---|---|---|
| Fixed window counter | `INCR` + `EXPIRE` | O(1), 1 int | ❌ Cho phép **2× limit** ở ranh giới cửa sổ | Đơn giản nhất, nhưng lỗ burst là thật với place-bet |
| Sliding window log | `ZREMRANGEBYSCORE` + `ZADD` + `ZCARD` | **O(n)** — 1 member/request | ✅ Chính xác tuyệt đối | Chính xác nhưng bộ nhớ tỉ lệ traffic → tốn và dễ bị lợi dụng làm phình Redis |
| Sliding window counter (2 cửa sổ) | `HINCRBY` ×1 + đọc | O(1), 2 int | ✅ Xấp xỉ tốt | Cân bằng khá; cần Lua để atomic |
| Token bucket | Lua: đọc tokens+ts, tính refill, ghi | O(1), 2 field | ✅ Cho burst **có chủ đích** | Phù hợp khi muốn cho phép burst ngắn (đặt nhiều vé liên tiếp là hành vi thật) |
| **GCRA** (leaky bucket virtual scheduling) | **1 Lua `EVAL`** | O(1), **1 value** (TAT) | ✅ Smooth + burst có kiểm soát | **Khuyến nghị.** 1 RTT, 1 key, trả luôn `retryAfter`. Không cần cleanup. |

**Chốt: GCRA.** Lý do cụ thể cho repo này, không phải vì "thuật toán xịn":

1. **1 round-trip duy nhất** — quan trọng nhất vì Redis nằm ngoài VPC (§2.5), mỗi RTT là chi phí thật
   trên hot path place-bet.
2. **1 key 1 value** (Theoretical Arrival Time) → không ZSET phình, không job cleanup, TTL tự nhiên.
3. **Trả trực tiếp `retryAfterMs`** từ chính phép tính → có số cho `Retry-After` header (§2.7) mà
   không cần query thêm.
4. Tách `limit` (rate) và `burst` thành 2 tham số độc lập → diễn đạt được "10 vé/phút nhưng cho phép
   bấm 3 vé liền" mà không cần 2 rule.

`RedisRepository` chưa có `eval` → **phải bổ sung** `eval`/`evalSha` (§2.5). Dùng `EVALSHA` +
fallback `EVAL` khi `NOSCRIPT` để tiết kiệm băng thông mỗi lần gọi.

> **Không chọn thư viện ngoài.** `rate-limiter-flexible` / `@upstash/ratelimit` đều tốt, nhưng:
> repo đã có `RedisRepository` + convention key tập trung (`cacheKey`, `CacheNamespace`), thêm dep sẽ
> tạo **hệ key thứ hai** không qua registry (`namespaces.ts`) → đúng thứ `cache-design.mdc` §2.1 cấm.
> Lua GCRA ~25 dòng, tự chủ hoàn toàn, không lock-in.

### 3.3. Idempotency — hai phương án, và tại sao phương án "ít công nghệ hơn" lại thắng

Đây là phát hiện quan trọng nhất của doc này.

#### Phương án A — Redis idempotency store (cách "sách vở")

Client gửi header `Idempotency-Key`. Middleware chạy state machine trong Redis:
`SET key NX` → `IN_FLIGHT` → handler chạy → ghi `COMPLETED` + cache nguyên response → request trùng
trả lại response cũ.

- ✅ Generic: dùng được cho **mọi** endpoint, kể cả endpoint không ghi DB.
- ✅ Trả lại **đúng response cũ** (client không phân biệt được đâu là replay).
- ❌ **+2 RTT** trên hot path (reserve trước + commit sau).
- ❌ **Redis trở thành single point of failure của đường tiền.** Redis down → hoặc mất bảo vệ
  (fail-open) hoặc sập đặt cược (fail-closed). Cả hai đều tệ.
- ❌ TTL Redis hết (24h) → key biến mất → duplicate lại lọt.

#### Phương án B — Mongo-native: `tx` deterministic + unique index (khuyến nghị cho place-bet)

Quan sát: **WAL `tx_intents` đã nằm đúng chỗ cần thiết** — insert **trước** khi gọi tenant debit
(`debit-player-service.ts:191` rồi `195`), và **đã có unique index `{tx}`**. Nó đã là một
idempotency store bền vững, chỉ thiếu **một thứ duy nhất**: `tx` hiện random nên duplicate không đụng
vào unique index.

Sửa: `tx` **dẫn xuất tất định** từ `(accountId, idempotencyKey)` — vd UUIDv5 hoặc
`sha256 → định dạng UUID`. Khi đó:

- Request 1: insert WAL `tx=X` → OK → debit → save → `COMPLETED`.
- Request 2 (duplicate, cùng `Idempotency-Key`): derive ra **cùng `tx=X`** → insert WAL **duplicate
  key error** → biết ngay đây là replay → tra ticket theo `tx` → trả kết quả cũ.

Ưu điểm:

- ✅ **0 round-trip thêm** trên happy path. Insert WAL là bước **đã có**, không thêm bước nào.
- ✅ **Cùng mức bền vững với chính giao dịch** — không thêm điểm chết. Mongo down thì đặt cược cũng
  đã không chạy được rồi (WAL insert fail → `serviceUnavailable`, `debit-player-service.ts:252-258`).
- ✅ Tồn tại 14 ngày theo TTL WAL (`tx-intent.ts:205-211`) — dài hơn mọi cửa sổ retry hợp lý.
- ✅ Tận dụng đúng invariant tenant đã cam kết: cùng `tx` → tenant trả `duplicate: true`, **không
  double-debit** (`transaction/types.ts:127`). Tức kể cả khi race lọt qua, tiền vẫn an toàn.

Nhược điểm / việc phải làm thêm:

- ⚠️ Cần **index `{tx}` trên collection ticket** của 7 game để tra kết quả cũ — **hiện KHÔNG có**
  (đã verify: `tx` có trên ticket doc, vd `packages/game-keno/src/entities/ticket.ts:251`, nhưng
  không index nào). Đây là thay đổi bắt buộc.
- ⚠️ **Concurrent in-flight**: request 2 đến khi request 1 *chưa xong* → duplicate key nhưng ticket
  chưa tồn tại → phải trả `409 IDEMPOTENCY_CONFLICT` ("đang xử lý, thử lại sau"), **không** được trả
  200 rỗng. Phân biệt bằng `phase` của WAL (`DEBIT_PENDING` = đang chạy, `COMPLETED` = xong).
- ⚠️ Chỉ áp dụng được cho flow **đã có WAL** (hiện: place-bet). Endpoint tương lai không ghi WAL thì
  cần Phương án A.

#### Chốt: dùng cả hai, theo đúng chỗ

| Loại endpoint | Cơ chế | Lý do |
|---|---|---|
| `place-bet` ×7 (đường tiền, có WAL) | **B — Mongo-native** | 0 RTT thêm, bền, tận dụng invariant sẵn có |
| Mutation tương lai không có WAL (nạp/rút operator, `suspend-player`…) | **A — Redis** | Không có WAL để dựa vào |
| Read-only (`get-current-draw`, `list-tickets`…) | **Không cần** | Idempotent theo bản chất HTTP |

### 3.4. Fail-open hay fail-closed khi Redis chết?

Phải quyết riêng cho từng lớp — đây là chỗ dễ sai nhất:

| Lớp | Redis down → | Lý do |
|---|---|---|
| Rate limit (L1) | **Fail-open** (cho qua + log cảnh báo) | Rate limit là *phòng thủ*, không phải *correctness*. Chặn hết traffic thật để ngăn abuse giả định là tự gây sự cố. L0 (WAF) vẫn còn đứng. Đồng nhất triết lý `RedisCacheStore` fail-open (`packages/cache` §JSDoc). |
| Idempotency **B** (Mongo) | Không liên quan Redis | Ưu điểm chính của phương án B |
| Idempotency **A** (Redis) | **Fail-closed** | Đường tiền: thà từ chối còn hơn trừ tiền 2 lần. Nhưng chính vì thế **không dùng A cho place-bet**. |

Hệ quả thiết kế: rate limit **phải** dùng adapter fail-open riêng (không gọi thẳng `RedisRepository`
fail-fast), kèm timeout ngắn — tiền lệ `DEFAULT_REDIS_COMMAND_TIMEOUT_MS = 300` ms
(`packages/cache/src/constants.ts`). Đề xuất **100 ms** cho rate limit: chặn chậm hơn 100ms thì thà
cho qua.

### 3.5. Latency budget trên hot path `place-bet`

Hiện tại place-bet đã có: 2 config reads (đã cache), draw reads, ticket counter `findOneAndUpdate`,
WAL insert, tenant HTTP call, Mongo transaction. Tenant HTTP call là phần đắt nhất (hàng trăm ms).

| Thành phần thêm vào | Chi phí |
|---|---|
| Rate limit GCRA | **+1 RTT Redis** (~2–15 ms ngoài VPC, cap 100 ms) |
| Idempotency B | **+0** (dùng lại WAL insert) |
| Idempotency A (nếu dùng) | +2 RTT |

→ Tổng chi phí phòng thủ cho place-bet: **1 Redis round-trip**. Đây là lý do trọng tâm để chọn
GCRA (1 op) + Mongo-native idempotency (0 op).

### 3.6. Vị trí trong middleware chain

Thứ tự đúng trong `buildHandler` (`handler-wrappers.ts:98-109`):

```
auth  →  rateLimit  →  validatorZod  →  idempotency  →  successEnvelope  →  errorHandler
        ↑ sau auth: cần accountId/tenantId       ↑ sau validate: cần body đã parse để hash fingerprint
```

- **Rate limit sau `auth`**: để key theo `accountId`/`tenantId` (mạnh hơn IP — mobile NAT dùng chung
  IP). Với endpoint public (`refresh-token`, `player-login`) không có identity → fallback IP qua
  `extractClientIpFromApiGatewayV2` (`@megawin/shared/utils/ip`, đã dùng ở
  `handlers/keno/place-bet.ts:154`).
- **Rate limit trước `validatorZod`**: từ chối sớm, không tốn CPU parse body của kẻ spam.
- **Idempotency sau `validatorZod`**: cần body đã parse để hash fingerprint phát hiện *cùng key khác
  payload* → `422`.

Cả hai **opt-in per-endpoint** qua options của wrapper, mặc định tắt. Không bật mù toàn bộ: bật rate
limit cho `list-draw-results` cùng ngưỡng với `place-bet` là vô nghĩa và dễ gây sự cố oan.

### 3.7. Đặt package ở đâu, tên gì

- **Không** đặt trong `packages/cache`: cache là *fail-open, được phép sai*; rate limit/idempotency là
  *shared state, phải đúng*. Trộn vào làm mờ ranh giới `RedisRepository` (fail-fast) vs `RedisCacheStore`
  (fail-open) mà `packages/cache` đang giữ rất rõ.
- **Không** prefix `operator-` — `operator-monorepo-structure.mdc` §1 chỉ bắt buộc prefix cho package
  *thuộc product Operator*. Đây là hạ tầng core dùng cho `api-player`/`api-tenant` (B2B RGS). Nhưng
  **phải** tránh tên trần đã để dành (`wallet`, `agent`, `player`, `tenant-*`) — `guard` không nằm
  trong danh sách đó.
- Đề xuất: **`packages/guard` → `@megawin/guard`**, subpath `./rate-limit`, `./idempotency`,
  `./middleware`. Thêm `CacheNamespace.Guard = "guard"` vào `packages/cache/src/namespaces.ts` (§2.1
  của `cache-design.mdc` yêu cầu đăng ký tập trung, **không** hard-code chuỗi namespace).

Key format tuân đúng convention hiện có:

```
guard:rl:v1:{route}:{subjectType}_{subjectId}      # rate limit (GCRA TAT)
guard:idem:v1:{scope}:{hash(idempotencyKey)}       # idempotency (phương án A)
```

`hashKeyPart()` (`packages/cache/src/keys.ts`) bắt buộc cho phần do client kiểm soát — key lộ trong
log/monitoring Redis.

---

## 4. Đề xuất đã re-review (kèm verdict)

Mỗi đề xuất dưới đây đã qua một lượt tự phản biện "cái này có thực sự cần, hay chỉ nghe hay?".

| # | Đề xuất | Verdict | Lý do re-review |
|---|---:|---|---|
| 1 | Package `@megawin/guard` — GCRA rate limit + idempotency, hook qua `buildHandler` | **KEEP** | Điểm hook đã tồn tại sẵn (§2.1), chi phí 1 RTT. Giá trị/chi phí rõ ràng. |
| 2 | Bổ sung `eval`/`evalSha` vào `RedisRepository` | **KEEP** | Bắt buộc cho atomic GCRA. `redis@6.2.1` đã hỗ trợ (§2.5), chỉ expose thêm. |
| 3 | Idempotency place-bet bằng **`tx` deterministic + WAL unique index** | **KEEP (ưu tiên cao nhất)** | 0 RTT thêm, không thêm điểm chết, vá **bug tài chính đang mở** (§2.3). Đây là item giá trị nhất toàn doc. |
| 4 | Thêm index `{tx}` (unique) trên ticket 7 game | **KEEP** | Điều kiện cần của #3 — không có thì không tra được kết quả cũ. |
| 5 | Map `IDEMPOTENCY_CONFLICT` → 409 trong `http-status.ts` | **KEEP** | 1 dòng. Hiện rơi về 400 (§2.6) → client không phân biệt được với lỗi validate. |
| 6 | Rate limit trả `Retry-After` qua `earlyResponse` | **KEEP** | Có tiền lệ `validatorZodMiddleware` (§2.7). Không đụng error handler chung. |
| 7 | Idempotency store Redis generic (phương án A) | **DEMOTE — Phase 3** | Chưa có consumer thật: mọi mutation hiện tại trên đường tiền đều có WAL. Xây trước khi có nhu cầu = code chết. Bật khi operator (nạp/rút) khởi động. |
| 8 | AWS WAF rate-based rule (L0) | **DEMOTE — hạng mục infra riêng** | Giá trị thật (chặn trước Lambda) nhưng là việc infra/Terraform, không phải code monorepo. Tách khỏi plan code để không block. |
| 9 | Response caching đầy đủ cho idempotent replay | **CUT** | Với #3, replay trả kết quả tra từ Mongo (ticket đã tồn tại) là đủ và đúng. Cache response thêm = thêm nguồn sự thật thứ hai cho cùng dữ liệu. |
| 10 | Distributed lock per-player quanh place-bet | **CUT** | Lock phân tán trên đường tiền là nguồn sự cố kinh điển (lock leak, TTL hết giữa giao dịch). #3 đã đạt cùng mục tiêu bằng unique index — rẻ và đúng hơn. |
| 11 | Rate limit theo IP làm mặc định toàn bộ | **CUT** | Mobile NAT + CGNAT → nhiều nghìn player chung IP → chặn oan. IP chỉ dùng cho endpoint **không** có identity (§3.6). |
| 12 | Config ngưỡng trong Mongo + backoffice UI | **DEMOTE — sau MVP** | MVP: hằng số trong code, deploy để đổi. Đưa vào DB ngay tạo thêm 1 read trên hot path và 1 trang UI chưa ai cần. |

### 4.1. Ma trận áp dụng — `apps/api-player`

Ngưỡng dưới là **đề xuất khởi điểm**, cần chốt với vận hành (xem §5).

| Endpoint | Rate limit | Idempotency | Ghi chú |
|---|---|---|---|
| `POST /games/{game}/bets` ×7 (`place-bet`) | ✅ **theo `accountId`** — vd 30/phút, burst 5 | ✅ **Phương án B** | Ưu tiên #1. Đường tiền. |
| `POST /auth/refresh-token` | ✅ **theo IP** — vd 10/phút | — | `withPublicHandler`, không auth → chỉ có IP. Chống brute-force token. |
| `GET /games/{game}/draws/current` ×7 | ✅ lỏng theo `accountId` — vd 120/phút | — | Endpoint bị poll nhiều nhất. Rate limit ở đây bảo vệ **Mongo**, bổ trợ micro-cache của `docs/cache` Phase 2. |
| `GET /games/{game}/jackpot` ×3 | ✅ lỏng — 120/phút | — | Cùng lý do. |
| `GET /games/{game}/tickets`, `tickets/pending`, `tickets/{id}/entries`, `entries/{id}/lines` | ✅ lỏng — 60/phút | — | Query có pagination → chống scraping. |
| `GET /games/{game}/draw-results`, `draw-results/{drawId}` | ✅ lỏng — 60/phút | — | Dữ liệu lịch sử, dễ bị crawl. |
| `GET /games/{game}/draws/{drawId}/combo-popularity` ×3 | ✅ **chặt hơn** — 20/phút | — | Endpoint aggregate nặng (đọc thống kê) → đắt nhất trên mỗi request. |
| `GET /games/jackpots` (aggregate 7 game) | ✅ **chặt hơn** — 30/phút | — | Fan-out nhiều use-case (`ListJackpotsUseCase`) → 1 request = nhiều query. |

### 4.2. Ma trận áp dụng — `apps/api-tenant`

⚠️ **Đã kiểm chứng: chỉ 3/6 handler thật sự được deploy.** `apps/api-tenant/src/handlers/` có 6 file
nhưng `src/functions/*.yml` chỉ khai 3 route. `get-player-detail.ts`, `list-players.ts`,
`suspend-player.ts` **không có event httpApi nào** → hiện là code chết, chưa lên API Gateway. Không
lên kế hoạch rate limit cho endpoint chưa tồn tại.

Identity là `tenantId` (`event.tenant.tenantId`, `with-tenant-auth.ts:21`) → server-to-server, ngưỡng
cao hơn player nhưng phải có. `REDIS_URI` **đã có** trong `apps/api-tenant/serverless.yml:81`.

| Endpoint (path thật) | Handler | Rate limit | Idempotency | Ghi chú |
|---|---|---|---|---|
| `POST /player/login` | `player-login.ts` | ✅ **`tenantId` + `playerExternalId`** — vd 10/phút/player, 600/phút/tenant | — | **Ưu tiên cao nhất của app này.** Có IP whitelist nhưng không giới hạn tần suất → enumeration `playerExternalId` (schema `[a-zA-Z0-9]{4,32}`, `player-login.ts:17-23`) |
| `GET /tenant/bets/feed` | `get-entry-feed.ts` | ✅ `tenantId` — vd 60/phút | — | `docs/cache/04` §2.1 ghi rõ *"bị tenant poll liên tục"*. Rate limit biến poll storm thành lỗi rõ ràng thay vì âm thầm đốt Mongo |
| `GET /tenant/reports/revenue` | `get-reports.ts` | ✅ **chặt** — 20/phút | — | Query nặng nhất app |
| ~~`/tenant/players`, `/tenant/players/{id}`, suspend~~ | 3 file | ⏸ **không deploy** | — | Khi nào có yml thì mới tính |


### 4.3. Mở rộng ngoài 2 app này

- **`apps/backoffice`** (Next.js): `buildHandler` không dùng ở đây — điểm hook tương ứng là
  `ApiRouteBuilder.handler()` (`packages/next`). Cùng `@megawin/guard` core, **adapter khác**. Ưu tiên
  thấp hơn (nội bộ, có auth nhân viên), nhưng route AI agent (`server/ai/**`, gọi model) là ứng viên
  rate limit rõ ràng vì tốn tiền token.
- **Operator tương lai** (`operator-api`, `operator-wallet-svc`): đây mới là nơi cần **đủ cả** rate
  limit + idempotency generic (nạp/rút không có WAL sẵn). `@megawin/guard` thiết kế core-agnostic ngay
  từ đầu để dùng lại, nhưng **không** xây tính năng cho operator trước khi operator tồn tại.
- **Worker** (`apps/worker-*`): **không** áp dụng. Rate limit là phòng thủ với traffic *ngoài*; worker
  là traffic nội bộ đã có SQS/Step Functions kiểm soát concurrency.

---

## 5. Câu hỏi mở — cần user/vận hành quyết

1. **Ngưỡng rate limit thực tế.** Các số ở §4.1/§4.2 là điểm khởi đầu theo kinh nghiệm, **chưa** dựa
   trên số liệu thật. Cần: p99 số request/phút/player hiện tại từ CloudWatch/Axiom (dataset
   `megawin-player-prod` đã cấu hình trong `serverless.yml`) trước khi chốt. Đề xuất chạy
   **shadow mode** trước (chỉ log, không chặn) 1–2 tuần.
2. **`Idempotency-Key` là bắt buộc hay tùy chọn cho `place-bet`?** → **ĐÃ CHỐT 2026-09-20: tùy chọn +
   fingerprint guard.**

   Cụ thể: header `Idempotency-Key` **tùy chọn** (không breaking change với tenant đang chạy). Khi
   tenant **không** gửi key, middleware tự sinh fingerprint `hash(accountId + canonical(body))` và
   chặn nếu thấy cùng fingerprint trong cửa sổ ngắn (~5s) → `409 IDEMPOTENCY_CONFLICT`. Nhờ đó
   double-tap bị bắt **mà tenant không phải đổi code**.

   Hệ quả bắt buộc ghi vào plan:
   - Fingerprint guard **cần Redis** (không có WAL để dựa vào khi chưa có key) → `p0-01` phụ thuộc
     `p1-01`. Nhưng guard này **fail-open** (Redis down → cho qua), vì nó là suy đoán về ý định
     người dùng, không phải ràng buộc tài chính. Ngược lại nhánh có `Idempotency-Key` đi qua WAL
     unique index → luôn đúng, không phụ thuộc Redis.
   - Cửa sổ 5s là **suy đoán**: player *thật sự* muốn 2 vé giống hệt trong 5s sẽ bị chặn oan. Phải
     bật **shadow mode** (chỉ log) để đo tần suất thật trước khi chặn, và phải là **hằng số cấu hình
     được**, không hard-code rải rác.
   - `canonical(body)` phải ổn định: sort key, sort `drawIds`/`boards` theo thứ tự tường minh — nếu
     không, cùng một ý định gửi 2 lần với thứ tự JSON khác nhau sẽ ra 2 fingerprint khác.

3. **Redis instance riêng hay dùng chung với cache?** `constants.ts` đã chừa đường
   (`redisEnvKey` truyền được, JSDoc nêu sẵn ví dụ `REDIS_RATELIMIT_URI`). Dùng chung = $0 thêm, đơn
   giản; tách = cô lập workload, tránh rate-limit traffic evict cache config. Đề xuất: **dùng chung ở
   MVP**, tách khi đo thấy eviction.
4. **Redis hiện tại là provider nào và latency p99 bao nhiêu?** Không app nào có VPC config (§2.5) nên
   chắc chắn là endpoint public, nhưng cần xác nhận Upstash vs Redis Cloud và **cùng region
   `ap-southeast-1` hay không** — nếu cross-region thì 1 RTT có thể 50–100ms và toàn bộ tính toán
   latency ở §3.5 phải xem lại.
5. **L0 (WAF) có được cấp ngân sách không?** Nếu không, L1 phải chịu cả tải flood → cần cân nhắc
   `reservedConcurrency` cho các Lambda public như biện pháp thay thế $0.

---

## 6. Plans phái sinh

**Đã tạo: [`.cursor/plans/guard-ratelimit-idempotency/`](../plans/guard-ratelimit-idempotency/00-overview.md)**
(bảng trạng thái là source of truth về tiến độ). Mỗi plan mở đầu bằng
`> Nguồn: .cursor/analysis/system-ratelimit-idempotency.analysis.md`.

Thứ tự đánh số **đã đổi** so với bản nháp đầu vì quyết định §5.2: fingerprint guard cần Redis → package
foundation phải đứng trước idempotency, không còn là hai nhánh song song.

| Plan | Phase | Nội dung | Chặn bởi |
|---|---|---|---|
| `p0-01-guard-package-foundation` | P0 | Tạo `@megawin/guard`; bổ sung `eval`/`evalSha` vào `RedisRepository`; Lua GCRA + test; adapter fail-open timeout 100ms; `CacheNamespace.Guard` | — |
| `p0-02-idempotent-place-bet` | P0 | **Vá bug tài chính.** `tx` deterministic + index `{tx}` ×7 + fingerprint guard + map `IDEMPOTENCY_CONFLICT`→409 + đồng bộ `player-sdk` | `p0-01` |
| `p1-01-ratelimit-middleware` | P1 | Middleware + hook `buildHandler`; `earlyResponse` kèm `Retry-After`; shadow mode | `p0-01` |
| `p1-02-rollout-api-player` | P1 | Bật theo §4.1 — `place-bet` + `refresh-token` trước | `p1-01` |
| `p1-03-rollout-api-tenant` | P1 | Bật theo §4.2 — `player-login` + `entry-feed` trước | `p1-01` |
| `p2-01-observability` | P2 | Metrics allow/deny/fail-open; alert khi fail-open kéo dài | `p1-02` |
| `p3-01-generic-idempotency-store` | P3 | Phương án A (Redis) — **chỉ khi** operator/mutation không-WAL xuất hiện | `p0-01` |

Hạng mục infra tách riêng (không thuộc plan code): AWS WAF rate-based rule + API Gateway throttle.


---

## 7. Phụ lục — phác thảo để plan không phải thiết kế lại

### 7.1. GCRA trong Lua (1 `EVAL`, 1 key, 1 value)

```
-- KEYS[1] = guard:rl:v1:{route}:{subject}
-- ARGV[1] = emission_interval_ms  (= window_ms / limit)
-- ARGV[2] = delay_tolerance_ms    (= emission_interval_ms * burst)
-- ARGV[3] = now_ms
-- → { allowed(0|1), retry_after_ms, remaining_burst }
local tat = tonumber(redis.call('GET', KEYS[1])) or tonumber(ARGV[3])
local now = tonumber(ARGV[3])
local ei, dt = tonumber(ARGV[1]), tonumber(ARGV[2])
if tat < now then tat = now end
local allow_at = tat - dt
if now < allow_at then
  return { 0, math.ceil(allow_at - now), 0 }
end
local new_tat = tat + ei
redis.call('SET', KEYS[1], new_tat, 'PX', math.ceil(new_tat - now + dt))
return { 1, 0, math.floor((now - (new_tat - dt)) / ei) }
```

`now_ms` truyền **từ Lambda**, không dùng `TIME` của Redis — giữ script `EVAL`-deterministic và
tránh phụ thuộc clock Redis. Đánh đổi: clock skew giữa các Lambda; không đáng kể ở thang phút.

### 7.2. Hình dạng API mong muốn (giữ handler mỏng)

```ts
// Rate limit — opt-in, khai cạnh schemas, không đụng thân handler
export const handler = withPlayerAuth(
  async (event) => useCase.run({ /* … */ }),
  {
    schemas: { body: kenoPlaceBetBodySchema },
    rateLimit: { route: "keno.place-bet", limit: 30, windowSec: 60, burst: 5, subject: "account" },
    idempotency: { mode: "tx-derived" },   // Phương án B
  },
);
```

Điểm cần giữ: khai báo **tĩnh, đọc được bằng mắt** ngay tại handler (cùng tinh thần
`require-static-classes` của `@shadcn/lint`), không cấu hình ẩn ở file khác.

### 7.3. Rủi ro triển khai cần ghi vào plan

| Rủi ro | Giảm thiểu |
|---|---|
| Bật chặn ngay → chặn oan traffic thật | **Shadow mode** log-only trước, đọc số liệu rồi mới bật |
| Redis chết âm thầm → fail-open lặng lẽ, mất phòng thủ mà không ai biết | Metric + alert riêng cho `fail_open_count` (p2-01) |
| `tx` deterministic đổi cách tính giữa 2 lần deploy → mất tính idempotent | Hàm derive thuần + **unit test vector cố định**; version trong công thức |
| Index `{tx}` unique trên ticket gặp dữ liệu cũ trùng/null | Kiểm tra dữ liệu hiện có trước khi tạo unique index; cân nhắc `partialFilterExpression` cho `tx != null` |
| Client cũ không gửi `Idempotency-Key` tưởng đã được bảo vệ | Ghi rõ trong `player-sdk` CHANGELOG + README rằng bảo vệ **chỉ có** khi gửi key |



