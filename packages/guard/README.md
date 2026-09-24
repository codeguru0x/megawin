# `@megawin/guard`

Lớp phòng thủ dùng chung: **rate limit GCRA** (đã có) + **idempotency** (chưa ship).
Rate limit **không phải correctness** — Redis chết thì **cho qua** (`fail-open`), không được tự
gây outage. Đường tiền (`place-bet`) **không** phụ thuộc package này.

> **Phạm vi hiện tại (p0-01 / p0-01b):** primitive `RateLimiter.checkRateLimit`.
> Subpath `./middleware` còn trống — hook `buildHandler` là việc của `p1-01`.
> App (`api-player` / `api-tenant`) **chưa** import cho tới khi rollout plan tương ứng xong.

---

## Mục lục

1. [Hình dung 30 giây](#1-hình-dung-30-giây)
2. [GCRA hoạt động thế nào](#2-gcra-hoạt-động-thế-nào)
3. [Cách gọi](#3-cách-gọi)
4. [Từ điển cấu hình](#4-từ-điển-cấu-hình)
5. [Chọn `subject`](#5-chọn-subject)
6. [Chọn `route`](#6-chọn-route)
7. [Đọc `RateLimitDecision`](#7-đọc-ratelimitdecision)
8. [Options của `RateLimiter`](#8-options-của-ratelimiter)
9. [Catalogue use case — nên cấu hình thế nào](#9-catalogue-use-case--nên-cấu-hình-thế-nào)
10. [Cách chọn ngưỡng khi endpoint mới](#10-cách-chọn-ngưỡng-khi-endpoint-mới)
11. [Anti-pattern — lỗi dễ mắc](#11-anti-pattern--lỗi-dễ-mắc)
12. [Fail-open & vận hành](#12-fail-open--vận-hành)
13. [Key Redis](#13-key-redis)
14. [Test](#14-test)
15. [Chưa làm / không làm ở đây](#15-chưa-làm--không-làm-ở-đây)

---

## 1. Hình dung 30 giây

Mỗi lần gọi `checkRateLimit` = **1 quyết định** cho **1 cặp** `(route, subject)`:

```
"keno.place-bet" + account "acc-001"  →  1 xô riêng
"keno.place-bet" + account "acc-002"  →  xô khác (không chung quota)
"mega645.place-bet" + account "acc-001" → xô khác (chơi 2 game cùng lúc là hợp lệ)
```

Rule `{ limit: 30, windowSec: 60, burst: 5 }` nghĩa là:

| Ý                          | Số                                                      |
| -------------------------- | ------------------------------------------------------- |
| Nhịp bền (steady)          | **30 request / 60 giây** ≈ 1 request mỗi **2 giây**     |
| Burst                      | Được bắn **6 request liền** (1 + `burst`), rồi phải chờ |
| Request thứ 7 ngay lập tức | `allowed: false`, `retryAfterMs` ≈ 2000                 |

`burst` mặc định là **`0`** — không khai thì **không** được bắn liền; request thứ 2 phải chờ đủ
khoảng cách steady. Đây là chỗ dễ cấu hình thiếu nhất.

---

## 2. GCRA hoạt động thế nào

GCRA (Generic Cell Rate Algorithm) **không** đếm “còn bao nhiêu request trong cửa sổ 60s”
kiểu sliding-window. Nó giữ **một số** trên Redis: **TAT** (Theoretical Arrival Time) —
thời điểm request _tiếp theo_ “đáng lẽ” được phép ở nhịp bền.

Công thức thuần (`computeGcraParams`):

```
emissionIntervalMs = max(1, floor(windowSec * 1000 / limit))
delayToleranceMs   = burst * emissionIntervalMs          // burst mặc định = 0
```

| Tham số nội bộ              | Ý nghĩa                                                | Ví dụ `{30, 60, burst: 5}` |
| --------------------------- | ------------------------------------------------------ | -------------------------- |
| `emissionIntervalMs` (`ei`) | Khoảng cách tối thiểu giữa 2 request ở nhịp bền        | `2000` ms                  |
| `delayToleranceMs` (`dt`)   | Độ “nợ” tối đa — được phép đi trước nhịp bền bao nhiêu | `5 × 2000 = 10000` ms      |

Lua (1 `EVAL` / 1 key / 1 value TAT):

1. `allow_at = TAT − dt`
2. `now < allow_at` → **chặn**, `retryAfterMs = ceil(allow_at − now)`
3. Còn lại → **cho qua**, `TAT += ei`, TTL key tự hết hạn (`PX`)

Vì sao GCRA chứ không phải “N request / phút” cổ điển:

- **1 RTT, 1 key**, trả luôn `retryAfterMs` — Lambda chạy ngoài VPC, mỗi RTT Redis là chi phí thật.
- Tách **rate** (`limit`/`windowSec`) khỏi **burst** — player bấm place-bet 5 vé liên tiếp là hành
  vi thật, không phải tấn công.
- Redis 8.6 **không có** lệnh rate-limit native (`GCRA` từng có ở 8.8-M02 rồi bị rút). Lua là
  lựa chọn duy nhất, không phải tạm bợ.

### Dòng thời gian cụ thể

Rule `{ limit: 30, windowSec: 60, burst: 5 }`, 6 request trong 50 ms:

```
t=0ms     #1 allowed   TAT = now +  2000
t=10ms    #2 allowed   TAT = now +  4000
t=20ms    #3 allowed   TAT = now +  6000
t=30ms    #4 allowed   TAT = now +  8000
t=40ms    #5 allowed   TAT = now + 10000
t=50ms    #6 allowed   TAT = now + 12000     ← hết burst (1 + 5)
t=60ms    #7 DENIED    retryAfter ≈ 1940ms   allow_at = TAT − 10000
t≈2000ms  #8 allowed   lại vào nhịp bền 1 req / 2s
```

`burst: 0` (mặc định):

```
t=0ms     #1 allowed
t=10ms    #2 DENIED    phải chờ đủ ei (2s)
```

Công thức nhanh trong đầu:

- Số request **liền mạch** được phép ≈ **`1 + burst`** (khi `burst < limit`).
- Muốn đúng `limit` request bắn một phát → đặt `burst = limit - 1`
  (test integration khoá đúng vector này).
- Sau khi hết burst, nhịp trở về `limit / windowSec`.

---

## 3. Cách gọi

Hai đường dùng — **đừng lẫn**:

| Đường                                                                | Khi nào                                                                          | Import                                                      |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Khai báo trên handler** (`rateLimit: { … }` trong options wrapper) | ~76 endpoint `api-player` / `api-tenant` — **đường chính** sau `p1-01`           | Không import `@megawin/guard` ở app; `@megawin/auth` gọi hộ |
| **Gọi `RateLimiter` trực tiếp**                                      | Subject lấy từ **body** (sau Zod), hoặc worker / chỗ không đi qua `buildHandler` | `@megawin/guard`                                            |

Hiện tại chỉ đường 2 tồn tại. Đường 1 chưa hook — khai báo dưới đây là **hình dạng đích** để
chọn số đúng từ bây giờ, tránh phải đoán lại khi rollout.

### 3.1. Gọi trực tiếp (API đã ship)

```ts
import { GuardSubjectType, RateLimiter, type RateLimitDecision, type RateLimitRule } from "@megawin/guard";

// 1 instance / process là đủ — stateless, SHA Lua tính local, không cache per-process.
const limiter = new RateLimiter();

const rule: RateLimitRule = { limit: 30, windowSec: 60, burst: 5 };

const decision: RateLimitDecision = await limiter.checkRateLimit({
  route: "keno.place-bet",
  subject: { type: GuardSubjectType.Account, id: accountId },
  rule,
  // nowMs — CHỈ inject trong unit test. Production để trống (= Date.now()).
});

if (decision.failedOpen) {
  // Redis lỗi — đã CHO QUA. Bắt buộc đếm metric (p2-01). Không trộn với deny.
}

if (!decision.allowed) {
  // Chặn thật. Map retryAfterMs → header Retry-After (giây, làm tròn LÊN, tối thiểu 1).
  const retryAfterSec = Math.max(1, Math.ceil(decision.retryAfterMs / 1000));
  // 429 + envelope { success: false, error: { code: "TOO_MANY_REQUESTS", message } }
}
```

`checkRateLimit` **không bao giờ throw**. Config sai (`limit: 0`, `route` chứa `:`) cũng
fail-open — xem [§11](#11-anti-pattern--lỗi-dễ-mắc).

### 3.2. Khai báo handler (hình dạng sau `p1-01`)

```ts
export const handler = withPlayerAuth(async (event) => useCase.run({/* … */}), {
  schemas: { body: kenoPlaceBetBodySchema },
  rateLimit: {
    route: "keno.place-bet",
    limit: 30,
    windowSec: 60,
    burst: 5,
    subject: GuardSubjectType.Account, // KHÔNG viết "account" trần
  },
});
```

- **Không** khai `rateLimit` = **không bật**. Không bật mù toàn app.
- **Không** có field `mode` trên handler. Mode toàn cục qua env `GUARD_RATELIMIT_MODE`
  (`enforce` mặc định / `off` van tắt). Typo env → fallback **`enforce`**, không phải `off`.
- Chain: `auth → rateLimit → validatorZod` — sau auth (cần identity), trước Zod (không parse
  body kẻ spam).
- Logic phòng thủ **không** đưa vào use-case.

### 3.3. Khi nào vẫn phải gọi trực tiếp sau khi middleware ship

Một endpoint: `POST /player/login` (api-tenant) cần **2 lớp**, lớp per-player lấy
`playerExternalId` từ body → chỉ có **sau** Zod. Middleware đứng trước Zod nên lớp đó
gọi `RateLimiter` trong handler (1 lời gọi, handler vẫn mỏng). Không đảo chain cả app
cho 1 endpoint.

```ts
// Lớp 1 — middleware (trước Zod): per-tenant
//   { route: "tenant.player-login", limit: 600, windowSec: 60, subject: tenant }

// Lớp 2 — trong handler (sau Zod): per-player
const perPlayer = await limiter.checkRateLimit({
  route: "tenant.player-login.player",
  subject: { type: GuardSubjectType.Tenant, id: `${tenantId}:${playerExternalId}` },
  rule: { limit: 10, windowSec: 60 },
});
```

Hai `route` **khác nhau** → 2 key → 2 quota độc lập. Player xấu bị chặn không trừ quota
cả tenant.

---

## 4. Từ điển cấu hình

### 4.1. `RateLimitRule` — ngưỡng

```ts
interface RateLimitRule {
  limit: number; // bắt buộc, phải > 0
  windowSec: number; // bắt buộc, phải > 0
  burst?: number; // tuỳ chọn, phải >= 0; bỏ trống → DEFAULT_RATE_LIMIT_BURST = 0
}
```

| Field       | Ý nghĩa                                               | Đơn vị  | Ràng buộc                                | Mặc định                    |
| ----------- | ----------------------------------------------------- | ------- | ---------------------------------------- | --------------------------- |
| `limit`     | Số request tối đa ở **nhịp bền** trong 1 window       | request | **> 0**                                  | — (bắt buộc)                |
| `windowSec` | Độ dài window dùng để suy `ei`                        | giây    | **> 0** (chấp nhận fractional, VD `0.5`) | — (bắt buộc)                |
| `burst`     | Số request được phép **vượt** nhịp bền (đi trước TAT) | request | **≥ 0**                                  | **`0`** — spacing tuyệt đối |

**`limit` không phải “số request liền mạch”.** Số liền mạch ≈ `1 + burst`.
`limit` là nhịp bền sau khi hết burst.

| Muốn hành vi                                       | Khai                                                             |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| 30 req/phút, bắn được 6 cái liền (place-bet)       | `{ limit: 30, windowSec: 60, burst: 5 }`                         |
| 30 req/phút, **không** bắn liền (mặc định an toàn) | `{ limit: 30, windowSec: 60 }`                                   |
| Đúng 5 request bắn một phát rồi chờ cả phút        | `{ limit: 5, windowSec: 60, burst: 4 }`                          |
| 1 request / giây, không burst                      | `{ limit: 1, windowSec: 1 }` hoặc `{ limit: 60, windowSec: 60 }` |

`limit ≤ 0` / `windowSec ≤ 0` / `burst < 0` → `computeGcraParams` **throw**.
`RateLimiter` bắt rồi **fail-open** — route đó mất phòng thủ **âm thầm**, không 500.
Validate rule **trước khi** đưa vào production (xem [§14](#14-test)).

`limit > windowSec * 1000` (VD `{ limit: 2000, windowSec: 1 }`) → `ei` bị **clamp sàn 1 ms**.
GCRA hết ý nghĩa thực tế trên 1000 req/s. Clamp để tránh Lua `PX 0` → script error →
fail-open vĩnh viễn. Đừng cố “rate limit 2000 req/giây” bằng package này.

### 4.2. `RateLimitInput` — một lần check

| Field     | Ý nghĩa                                            | Ràng buộc                                                         |
| --------- | -------------------------------------------------- | ----------------------------------------------------------------- |
| `route`   | Id tĩnh do **developer** khai, nằm trong key Redis | Không chứa `:`. Format đích: `{game}.{action}` / `{app}.{action}` |
| `subject` | Ai đang bị đánh giá                                | `{ type: GuardSubjectType.*, id: string }`                        |
| `rule`    | Ngưỡng GCRA                                        | Xem §4.1                                                          |
| `nowMs`   | Đồng hồ epoch ms inject từ ngoài                   | Production **bỏ trống**. Unit test **bắt buộc** inject            |

`now` được sample **sau** `connect()` cố ý: handshake Redis có thể tốn tới 5s; `now` cũ làm
GCRA thấy `TAT > now` → deny oan request hợp lệ.

### 4.3. `GuardSubject`

| Field  | Ý nghĩa                                                                                                 |
| ------ | ------------------------------------------------------------------------------------------------------- |
| `type` | `GuardSubjectType.Account` / `.Tenant` / `.Ip` — **luôn** dùng member, không string trần                |
| `id`   | Id thô (`accountId` / `tenantId` / IP / composite). **Sẽ bị hash** khi build key — không lộ trong Redis |

`id` rỗng / `"unknown"` vẫn cho ra 1 key hợp lệ — mọi request thiếu identity sẽ **chung một xô**.
Đừng bịa id khi không có; hãy bỏ qua rate limit + log (middleware p1-01 làm vậy khi không đọc được IP).

---

## 5. Chọn `subject`

Thứ tự mạnh → yếu. Middleware sau này resolve theo đúng thứ tự này, **dừng ở cái đầu có giá trị**:

| `type`    | Lấy từ                                             | Dùng khi                                                          | Không dùng khi                                                 |
| --------- | -------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------- |
| `Account` | `event.user.accountId` (`withPlayerAuth`)          | Endpoint player đã auth — **mặc định đúng**                       | Public handler, không có user                                  |
| `Tenant`  | `event.tenant.tenantId` hoặc `event.user.tenantId` | `api-tenant` server-to-server; agent/company theo tenant          | Player API (1 tenant = hàng nghìn player → chặn oan cả tenant) |
| `Ip`      | `extractClientIpFromApiGatewayV2`                  | `withPublicHandler` (không identity): `refresh-token`, webhook lạ | **Mọi** mutation player (`place-bet`, …)                       |

**CGNAT / NAT mobile:** hàng nghìn player chung 1 IP 4G. `subject: Ip` trên `place-bet` =
chặn oan hàng loạt. Đây là lý do analysis **cắt** đề xuất “IP làm mặc định”.

Cấu hình sai (khai `Account` trên `withPublicHandler`) — middleware **không** crash, **không**
im lặng bỏ qua: fallback IP + `logError`. Gọi trực tiếp thì **bạn** phải tự xử lý biên này.

Ghép discriminator vào `id` (composite) chỉ khi **cùng** `type` nhưng cần xô nhỏ hơn
(VD per-player trong tenant — §3.3). Vẫn hash cả chuỗi. **Không** nhét discriminator vào
`route` nếu nó thay đổi theo request (phá cardinality, không đọc được khi debug).

---

## 6. Chọn `route`

`route` là **hằng do developer viết**, không lấy từ URL / header / body.

| Luật                    | Lý do                                                         | Ví dụ đúng                                  | Ví dụ sai                                            |
| ----------------------- | ------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------- |
| Duy nhất toàn app       | 2 endpoint trùng `route` = **chung quota**, chặn oan lẫn nhau | `"keno.place-bet"` vs `"keno.list-tickets"` | Mọi handler `"api"`                                  |
| 1 game = 1 route prefix | Chơi nhiều game cùng lúc là hành vi hợp lệ                    | `"keno.place-bet"`, `"mega645.place-bet"`   | `"place-bet"` chung 7 game                           |
| Không chứa `:`          | `:` là separator tầng key (`cache-design`)                    | `"keno.place-bet"`                          | `"keno:place-bet"` → throw → fail-open               |
| Tĩnh, đọc được          | Debug Redis bằng mắt                                          | `"tenant.bets-feed"`                        | `` `req.path` ``, `` `${game}.${action}` từ query `` |
| Format `{ns}.{action}`  | Quy ước debug + test regex                                    | `"keno.get-current-draw"`                   | `"GetCurrentDraw"`, `"keno_current"`                 |

Hai lớp trên cùng 1 endpoint (login tenant) = **hai** `route`:
`"tenant.player-login"` và `"tenant.player-login.player"`.

Sau `p1-02`: test tĩnh sẽ assert `new Set(routes).size === routes.length`. Trùng là bug
không thấy bằng mắt khi có 76 endpoint.

---

## 7. Đọc `RateLimitDecision`

```ts
interface RateLimitDecision {
  allowed: boolean; // true = cho qua (kể cả fail-open)
  retryAfterMs: number; // 0 khi allowed; ms tới lúc thử lại được
  remainingBurst: number; // burst còn lại ước lượng, ≥ 0 — XEM CẢNH BÁO
  failedOpen: boolean; // Redis lỗi/timeout — đã CHO QUA chủ động
}
```

### Bốn trạng thái — đừng gộp

| `allowed` | `failedOpen` | Nghĩa                                               | Việc caller phải làm                        |
| --------- | ------------ | --------------------------------------------------- | ------------------------------------------- |
| `true`    | `false`      | Cho qua, GCRA đã ghi TAT                            | Đi tiếp handler                             |
| `false`   | `false`      | **Chặn thật**                                       | 429 + `Retry-After` + log denied            |
| `true`    | `true`       | Redis chết / reply rác / config throw — **cho qua** | **Đếm metric** + (tuỳ) alert. **Không** 429 |
| `false`   | `true`       | **Không tồn tại** — fail-open luôn `allowed: true`  | —                                           |

`allowed === true` **không** đủ để kết luận “phòng thủ đang sống”. Thiếu `failedOpen` trong
dashboard = mất phòng thủ cả cụm Redis mà không ai biết.

### `retryAfterMs` → `Retry-After`

RFC dùng **giây**. Làm tròn **lên**, sàn **1**:

```ts
const retryAfterSec = Math.max(1, Math.ceil(decision.retryAfterMs / 1000));
// 1500ms → "2"    100ms → "1"    0 (allowed) → không set header
```

Làm tròn xuống → client retry sớm → bão. `"0"` → retry tức thì → bão.

`withRetry` của `@megawin/http-client` **không** đọc `Retry-After` (exponential backoff).
Header này cho **client bên ngoài** (player-sdk / tenant). Đừng sửa `withRetry` nhân tiện.

Message 429 là **UI tiếng Việt**, không lộ ngưỡng / route / tên class:

> “Bạn đang thao tác quá nhanh, vui lòng thử lại sau ít giây.”

### `remainingBurst` — lower bound, không phải canonical

Khi `burst > 0`, giá trị **thấp hơn** GCRA chuẩn đúng 1 ở các request còn burst
(vector `burst: 4` → `3, 2, 1, 0, 0` thay vì `4, 3, 2, 1, 0`). Request được phép cuối
cùng raw là `-1`, `parseDecision` kẹp về `0`.

Lệch **có chủ đích** về phía an toàn: client backoff **sớm hơn**, không bao giờ muộn hơn.
`burst: 0` (mặc định) hai công thức trùng nhau.

**Đừng** “sửa” Lua cho ra số canonical — đó là đổi contract, không phải bug. Đừng expose
`remainingBurst` thành “còn N request” trên UI/docs tenant. Dùng để log / header nội bộ
thì ghi chú đây là ước lượng thấp.

Decision **không** `readonly`. Mỗi lần fail-open là **object mới** (factory). Đừng cache /
mutate một decision dùng chung giữa các request.

---

## 8. Options của `RateLimiter`

```ts
interface RateLimiterOptions {
  redisEnvKey?: string; // mặc định DEFAULT_REDIS_ENV_KEY = "REDIS_URI"
  commandTimeoutMs?: number; // mặc định DEFAULT_RATE_LIMIT_TIMEOUT_MS = 250
}
```

| Option             | Ý nghĩa                             | Khi nào đổi                                                                   | Khi nào **không** đổi                                                              |
| ------------------ | ----------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `redisEnvKey`      | Tên env chứa Redis URI              | Tách instance `REDIS_RATELIMIT_URI` sau này (analysis §5.3) mà không refactor | Đừng truyền URI thẳng. Đừng tạo file `.env*`                                       |
| `commandTimeoutMs` | Trần pha **command** (EVALSHA/EVAL) | Đo p99 Redis staging thấy 250ms fail-open liên tục                            | Đừng hạ xuống 100ms “cho nhanh” — Redis hơi chậm nhưng healthy sẽ bypass phòng thủ |

### Trần thời gian — 250ms **không** phải trần cả lời gọi

| Pha                               | Trần        | Hằng                                                   |
| --------------------------------- | ----------- | ------------------------------------------------------ |
| connect / reconnect (`getClient`) | 5000 ms     | `DEFAULT_REDIS_CONNECT_DEADLINE_MS` (`@megawin/cache`) |
| command (EVALSHA / EVAL)          | 250 ms      | `DEFAULT_RATE_LIMIT_TIMEOUT_MS`                        |
| **Tổng worst-case**               | **5250 ms** | —                                                      |

Pha connect **không** bọc `withDeadline` riêng: cắt lời hứa không cắt `connect()` đang chạy;
trần thấp hơn handshake Redis Cloud → **mọi cold start Lambda fail-open** — mất phòng thủ
đúng lúc scale-up.

Worst-case 5250 ms chỉ trả ở request **đầu** sau mỗi cửa sổ circuit (`REDIS_CIRCUIT_OPEN_MS`
= 5s). Request sau fail-open ~0 ms nhờ circuit.

`new RateLimiter()` nhiều lần với cùng `redisEnvKey` an toàn (không chia sẻ state bẩn).
Có thể 2 instance trỏ 2 env khác nhau.

**Không** dùng `getDefaultCacheStore()` — đó là cache fail-open cho _dữ liệu_; guard cần
chạy _script_ → `RedisRepository` trực tiếp (đã bọc trong `RateLimiter`).

---

## 9. Catalogue use case — nên cấu hình thế nào

Số dưới đây là **điểm khởi đầu** đã chốt trong plan rollout (`p1-02` / `p1-03`), chưa phải
chân lý production. Hiệu chỉnh bằng **load test staging**: 429 ở nhịp client bình thường =
ngưỡng sai, sửa số chứ không kết luận “client sai”.

Nguyên tắc xếp hạng: endpoint càng **đắt mỗi request** → ngưỡng càng **chặt**. Chưa chắc →
**rộng tay** (chặn oan tốn uy tín hơn để lọt vài request). Siết lại luôn dễ hơn nới ra.

### 9.1. `api-player` — mutation / auth

| Endpoint                   | `route`                                  | Rule                                     | `subject` | Vì sao số này                                                                           |
| -------------------------- | ---------------------------------------- | ---------------------------------------- | --------- | --------------------------------------------------------------------------------------- |
| `POST …/bets` × 7 game     | `"{game}.place-bet"` **riêng từng game** | `{ limit: 30, windowSec: 60, burst: 5 }` | `Account` | Đường tiền. Burst 5 = chọn xong bấm liền vài vé. 30/phút đủ chơi thật, chặn script spam |
| `POST /auth/refresh-token` | `"auth.refresh-token"`                   | `{ limit: 10, windowSec: 60 }`           | **`Ip`**  | `withPublicHandler` — không identity. Chống brute-force token                           |

`refresh-token` là endpoint **dễ chặn oan nhất** (CGNAT). `limit: 10` phải load-test ca
“nhiều player chung 1 IP” trước khi chốt. Không chịu được → nâng `limit`, **không** đổi
`place-bet` sang IP.

`burst` chỉ có ở `place-bet`. Refresh không cần bắn liền — `burst: 0` đúng.

### 9.2. `api-player` — aggregate / nặng

1 request = nhiều query. Chặt nhất nhóm đọc.

| Endpoint                          | Rule                           | `subject` | Vì sao                     |
| --------------------------------- | ------------------------------ | --------- | -------------------------- |
| `GET …/combo-popularity` (4 game) | `{ limit: 20, windowSec: 60 }` | `Account` | Aggregate thống kê         |
| `GET /games/jackpots` (fan-out)   | `{ limit: 30, windowSec: 60 }` | `Account` | 1 request = nhiều use-case |

Không burst: UI không bấm 20 lần liên tiếp có chủ đích. Poll loop mới là mối đe dọa.

### 9.3. `api-player` — polling (lỏng)

Mục tiêu **không** phải chống abuse mà **bảo vệ Mongo** khỏi poll storm. Bổ trợ micro-cache,
không thay thế.

| Nhóm                                              | Rule                            | `subject` | Cảnh báo                                                                                                       |
| ------------------------------------------------- | ------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------- |
| `GET …/draws/current` × 7                         | `{ limit: 120, windowSec: 60 }` | `Account` | Countdown poll 1–3s → **20–60 req/phút là bình thường**. 120 chỉ chặn bất thường rõ. Thấp hơn = chặn user thật |
| `GET …/jackpot` × 3                               | `{ limit: 120, windowSec: 60 }` | `Account` | Cùng nhịp countdown                                                                                            |
| tickets / entries / lines / draw-results / config | `{ limit: 60, windowSec: 60 }`  | `Account` | Đọc, không đắt bằng aggregate                                                                                  |

≥ 3 endpoint cùng một bộ số → **hằng chia sẻ** (`apps/api-player/src/lib/`), không rải
`limit: 120` 20 chỗ rồi lệch. Không gom mọi rule vào 1 file config tập trung — đọc handler
phải thấy ngay ngưỡng.

### 9.4. `api-tenant` — server-to-server

Khác player ở 3 điểm: identity là `tenantId`; burst cao là bình thường (batch job); đã có
IP whitelist ở auth → rủi ro là **tenant hợp lệ hành xử sai** (poll loop, retry storm,
enumeration), không phải kẻ lạ. Ngưỡng **rộng tay**, message phải giúp tenant tự sửa.

| Endpoint                      | Lớp                        | `route`                        | Rule                                      | `subject`                                        | Vì sao                                                                                                                                                   |
| ----------------------------- | -------------------------- | ------------------------------ | ----------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /player/login`          | Per-tenant (middleware)    | `"tenant.player-login"`        | `{ limit: 600, windowSec: 60 }`           | `Tenant`                                         | Enumeration hàng loạt. 10 login/s / tenant                                                                                                               |
| `POST /player/login`          | Per-player (trong handler) | `"tenant.player-login.player"` | `{ limit: 10, windowSec: 60 }`            | `Tenant` + `id` ghép `tenantId:playerExternalId` | Brute-force 1 player. **Không** trừ lớp kia khi denied                                                                                                   |
| `GET /tenant/bets/feed`       | 1 lớp                      | `"tenant.bets-feed"`           | `{ limit: 60, windowSec: 60, burst: 10 }` | `Tenant`                                         | Tenant poll liên tục + cursor pagination (nhiều page liền). Burst 10 = batch-poll hợp lệ. 429 biến poll storm thành lỗi **rõ** thay vì đốt Mongo âm thầm |
| `GET /tenant/reports/revenue` | 1 lớp                      | `"tenant.reports-revenue"`     | `{ limit: 20, windowSec: 60 }`            | `Tenant`                                         | Query nặng nhất app. Gọi theo giờ/ngày → 20/phút đã rộng                                                                                                 |

Cô lập tenant là ràng buộc **hợp đồng**: tenant A 429 **không** được làm tenant B 429.
`subject.id = tenantId` (hash) đảm bảo điều này — test bắt buộc khi rollout.

### 9.5. Worker / chỗ không HTTP

Worker **không** rate-limit qua package này trừ khi có abuse vector rõ (VD webhook nội bộ
bị gọi lặp). Settle / payout / financial **cấm** phụ thuộc Redis. Idempotency đường tiền
là Mongo-native (`p0-02`), không phải guard.

Nếu thật sự cần (VD API nội bộ bị retry storm): `subject: Tenant` hoặc một `id` ổn định
của job key, `burst: 0`, `limit` sát nhịp cron. `route` tĩnh `"worker.{job}"`.

### 9.6. Bảng quyết định nhanh

```
Có identity player? ──không──► Public / IP
        │                         │
        │ có                      ├── Auth yếu (refresh, OTP) → Ip, burst 0, limit thấp (5–15/phút)
        ▼                         └── Còn lại → cân nhắc chưa bật (CGNAT)
Mutation (POST bet / debit)?
        │ có  → Account, burst 3–5, limit 20–30/phút, route per-game
        │
Đắt (aggregate / report)?
        │ có  → Account|Tenant, burst 0, limit 10–30/phút
        │
Client poll 1–3s?
        │ có  → Account, burst 0, limit ≥ 120/phút
        │
Tenant S2S batch?
        │ có  → Tenant, burst 5–10, limit hàng trăm/phút
        │
Còn lại (đọc thường)
              → Account|Tenant, burst 0, limit 60/phút
```

---

## 10. Cách chọn ngưỡng khi endpoint mới

Đừng copy số từ endpoint bên cạnh. Lần lượt 6 câu:

1. **Ai là subject?** Player đã auth → `Account`. Tenant S2S → `Tenant`. Không identity → `Ip`
   (và chấp nhận rủi ro CGNAT).
2. **Hành vi liền mạch có hợp lệ không?** Có (bấm 5 vé, kéo 10 page) → `burst` = số lần liền
   **trừ 1 không đủ**, nhớ `1 + burst`. Không → bỏ `burst` (mặc định 0).
3. **Nhịp bền client thật là bao nhiêu?** Countdown 1s → 60/phút. Đặt `limit` ≥ **2×** nhịp
   đó (headroom). Place-bet thủ công → vài lần/phút → `30` đã rộng.
4. **1 request đắt cỡ nào?** Fan-out / aggregate / scan → hạ `limit`. Cache hit / 1 find →
   có thể lỏng.
5. **`route` đã tồn tại chưa?** Trùng = bug. Per-game nếu cùng action trên nhiều game.
6. **Load test staging với nhịp thật.** 429 ở nhịp bình thường → **nâng `limit` hoặc `burst`**,
   không “dạy client chậm lại” khi chính mình đặt thấp.

Công thức ước lượng:

```
ei ≈ windowSec / limit          (giây giữa 2 request ở nhịp bền)
burst_ms = burst × ei           (cửa sổ được phép đi trước)
liền_mạch ≈ 1 + burst
```

Đổi `windowSec` mà giữ `limit` sẽ **đổi `ei`** — không phải “cùng rate, cửa sổ khác”.
`{ 30, 60 }` và `{ 15, 30 }` cùng 0.5 req/s nhưng TAT/TTL khác. Giữ `windowSec: 60` trừ khi
có lý do (cửa sổ ngắn cho OTP, cửa sổ dài cho quota ngày — quota ngày **không** hợp với GCRA
ms-precision; làm ở tầng khác).

---

## 11. Anti-pattern — lỗi dễ mắc

| #   | Sai                                                     | Hậu quả                                                        | Làm đúng                                               |
| --- | ------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------ |
| 1   | `limit: 0` / quên `limit`                               | Throw → **fail-open vĩnh viễn** cho route đó, không 500        | `limit > 0`. Test tĩnh assert mọi rule                 |
| 2   | `route` chứa `:`                                        | Throw → fail-open vĩnh viễn                                    | Dấu `.` (`keno.place-bet`)                             |
| 3   | Trùng `route` 2 endpoint                                | Chung quota, chặn oan lẫn nhau                                 | 1 endpoint = 1 route; test `Set`                       |
| 4   | 7 game chung `"place-bet"`                              | Chơi 2 game cùng lúc hết quota                                 | `"{game}.place-bet"`                                   |
| 5   | `subject: Ip` trên `place-bet`                          | CGNAT chặn hàng nghìn player                                   | `Account`                                              |
| 6   | `subject: Tenant` trên player API                       | 1 player spam khoá cả tenant                                   | `Account`                                              |
| 7   | Polling `limit: 20`                                     | Countdown 1s bị 429 sau 20s                                    | `limit: 120` nhóm current/jackpot                      |
| 8   | Quên `burst` trên place-bet                             | Vé 2 (bấm liền) bị 429 — user thật                             | `burst: 5`                                             |
| 9   | `burst = limit` (30/30)                                 | Bắn 31 request một phát, gần như không có steady               | `burst` là phần _vượt_, thường 10–20% `limit`          |
| 10  | `{ limit: 2000, windowSec: 1 }`                         | `ei` clamp 1ms, gần như không chặn                             | Đừng rate-limit > 1000 req/s bằng GCRA ms              |
| 11  | Bỏ qua `failedOpen`                                     | Redis down = mất phòng thủ, không alert                        | Đếm metric + alert (p2-01)                             |
| 12  | `if (!allowed \|\| failedOpen) return 429`              | Redis down thành **outage tự gây**                             | 429 **chỉ** khi `!allowed && !failedOpen`              |
| 13  | Sửa Lua cho `remainingBurst` “đúng chuẩn”               | Đổi contract, client backoff muộn hơn                          | Giữ lower bound                                        |
| 14  | Cache / mutate 1 object decision                        | Request sau nhận state bẩn (đã vá bằng factory; đừng tái phạm) | Mỗi check = object mới                                 |
| 15  | `getDefaultCacheStore()` + INCR                         | Hệ key thứ 2, không GCRA, không `retryAfter`                   | `new RateLimiter()`                                    |
| 16  | `rate-limiter-flexible` / `@upstash/ratelimit`          | Key ngoài `CacheNamespace` — trái `cache-design`               | Chỉ package này                                        |
| 17  | Đưa check vào use-case                                  | Use-case không được biết HTTP / Redis phòng thủ                | Middleware hoặc 1 lời gọi mỏng ở handler               |
| 18  | String `"account"` thay vì `GuardSubjectType.Account`   | Typo im lặng, trái §5.3                                        | `const object as const`                                |
| 19  | File config tập trung 76 rule                           | Sửa file A phá endpoint B, review không thấy                   | Khai tại handler; hằng chia sẻ chỉ khi ≥ 3 chỗ cùng số |
| 20  | `nowMs: Date.now()` cứng trong production rồi quên      | Clock lệch test lọt vào prod                                   | Production bỏ field                                    |
| 21  | Unit test không inject `nowMs`                          | Flaky theo đồng hồ máy                                         | `nowMs` cố định + tăng dần                             |
| 22  | Coi `allowed: true` là “Redis sống”                     | Fail-open cũng `allowed: true`                                 | Đọc `failedOpen`                                       |
| 23  | Bật cùng ngưỡng mọi endpoint                            | `list-draw-results` và `place-bet` không cùng nghĩa            | Catalogue §9                                           |
| 24  | `id: ""` / `"unknown"` khi thiếu identity               | Mọi request thiếu id chung 1 xô                                | Bỏ qua rate limit + log                                |
| 25  | `Retry-After` = `retryAfterMs` (ms ghi vào header giây) | Client chờ 2000 **giây**                                       | `ceil(ms / 1000)`                                      |
| 26  | Nhét ngưỡng / tên route vào message 429                 | Lộ cho kẻ dò; message là UI                                    | Câu tiếng Việt chung                                   |
| 27  | Mode `off` trên từng handler                            | 76 chỗ vô tình tắt; van khẩn cấp không còn 1 chỗ               | Chỉ env toàn cục                                       |
| 28  | Env typo → coi như tắt                                  | Mất phòng thủ vì gõ sai                                        | Fallback `enforce`                                     |

---

## 12. Fail-open & vận hành

Rate limit là **phòng thủ**. Chặn hết traffic thật để ngăn abuse giả định = tự gây sự cố.

Lua / Redis / timeout / reply sai shape / `computeGcraParams` throw →

```ts
{ allowed: true, retryAfterMs: 0, remainingBurst: 0, failedOpen: true }
```

Log (cùng chính sách `RedisCacheStore`):

| Lỗi                            | Log                                                              |
| ------------------------------ | ---------------------------------------------------------------- |
| `RedisCircuitOpenError`        | **Không** log (đã log 1 lần lúc mở circuit)                      |
| `DeadlineExceededError`        | `logError` + `phase: "command"`                                  |
| Còn lại (config, reply rác, …) | `logError` / `logWarn` kèm `route`, `subjectType`, `redisEnvKey` |

Van tắt khẩn cấp (sau `p1-01`): `GUARD_RATELIMIT_MODE=off` — **không** gọi Redis, 0 RTT.
Đổi env không cần deploy. Đây là thứ cứu sự cố lúc 2h sáng.

**Không** có shadow mode. Hiệu chỉnh ngưỡng = load test staging, không thu log production
rồi mới chặn.

`REDIS_URI` đã có trên `api-player` và `api-tenant`. Không sửa `.env*` để “cho guard chạy”.

---

## 13. Key Redis

```
guard:rl:v1:{route}:{subjectType}_{hash(subjectId)}
                 ▲                ▲
                 │                └── hashKeyPart() — 16 hex, không lộ IP / accountId / tenantId
                 └── nguyên văn, không hash — debug được
```

Ví dụ: `guard:rl:v1:keno.place-bet:account_a1b2c3d4e5f67890`

- Prefix tĩnh đăng ký 1 lần (`GUARD_KEYS.rateLimit` / `CacheNamespace.Guard`). Bump `v{n}`
  khi đổi shape/semantics — **không** gọi `cacheKey()` inline chỗ khác.
- Phần động nối `type_hash` bằng `_`, **không** `:`.
- Không có `{}` hash-tag — 1 key / 1 shard, cluster-safe.
- TTL `PX = max(1, ceil(newTAT − now + dt))` — key tự hết, không cleanup job.

`KEYS guard:*` trên staging: **không** được thấy IP / accountId / tenantId nguyên bản.
Thấy là bug (`hashKeyPart` bị bỏ).

---

## 14. Test

| Tầng        | Lệnh                                            | Được chứa                                                      | Không được chứa                  |
| ----------- | ----------------------------------------------- | -------------------------------------------------------------- | -------------------------------- |
| Unit        | `pnpm --filter @megawin/guard test:unit`        | `computeGcraParams`, `buildRateLimitKey`, JSDoc trần thời gian | Redis, Docker, `Date.now()` ngầm |
| Integration | `pnpm --filter @megawin/guard test:integration` | Redis 8.6 Testcontainers, fail-open, GCRA end-to-end           | Mock chính `RateLimiter`         |

```bash
pnpm --filter @megawin/guard test
pnpm --filter @megawin/guard check-types
oxlint packages/guard
```

Khi **consume** ở app:

- Logic GCRA **không** test lại — đã khoá ở đây.
- Test **khai báo**: mọi `route` duy nhất, `limit > 0`, `subject` là `GuardSubjectType`,
  mutation không dùng `Ip`, polling `limit` cao hơn mutation.
- Test **tiền**: `place-bet` 429 → **không** tạo vé (`countDocuments` đúng số request đã pass).
  Middleware đứng trước use-case — đây là test không được bỏ.
- Unit test gọi `checkRateLimit` / `computeGcraParams`: inject `nowMs`, không dựa đồng hồ máy.

Image Redis pin **`redis:8.6`** (khớp prod). Tag `redis:8` đang resolve ra 8.10 — lệch minor.

---

## 15. Chưa làm / không làm ở đây

| Việc                                             | Ở đâu                                                    |
| ------------------------------------------------ | -------------------------------------------------------- |
| Hook `buildHandler` + 429 envelope + env mode    | `p1-01` (`@megawin/auth`)                                |
| Bật khai báo `api-player`                        | `p1-02`                                                  |
| Bật khai báo `api-tenant` + docs tích hợp tenant | `p1-03`                                                  |
| Metric / alert `failedOpen`                      | `p2-01`                                                  |
| Idempotency `place-bet`                          | `p0-02` — **Mongo-native**, 0 Redis, độc lập package này |
| Generic idempotency store                        | `p3-01` (deferred)                                       |

Không làm:

- Thư viện rate-limit ngoài.
- Shadow mode.
- Đưa guard thành cache cho đường `docs/cache/04` đã cấm cache (`place-bet` validate draw
  realtime, balance callback, WAL).
- Phụ thuộc Redis trên đường tiền.

---

## Export

```ts
// @megawin/guard
export { RateLimiter, computeGcraParams, GCRA_LUA_SCRIPT };
export { buildRateLimitKey, GUARD_KEYS };
export { GuardSubjectType, DEFAULT_RATE_LIMIT_BURST, DEFAULT_RATE_LIMIT_TIMEOUT_MS };
export type { RateLimiterOptions, GcraParams, GuardSubject, RateLimitDecision, RateLimitInput, RateLimitRule };

// @megawin/guard/rate-limit   — cùng RateLimiter + math, không kéo keys/types barrel
// @megawin/guard/middleware   — placeholder, export rỗng tới p1-01
```
