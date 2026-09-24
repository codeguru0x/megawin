---
name: ""
overview: ""
todos: []
isProject: false
---

# p0-01b — Sửa lỗi Lua EVAL/EVALSHA trong `RateLimiter`

> Nguồn: review `packages/guard/src/rate-limit/rate-limiter.ts` (2026-09-22) đối chiếu **source thật**
> `node_modules/.pnpm/@redis+client@6.2.1/…` + Redis Cloud 8.6.
> Overview: `./00-overview.md` · Phase P0 · **Chặn bởi: `p0-01`** (đã done) · **Chặn: `p1-01`**

Plan sửa **quy trình gọi Lua script** của `RateLimiter`: bỏ round-trip thừa, vá 1 lỗ fail-open vĩnh
viễn, và chốt lại ranh giới timeout. **Không** thêm tính năng, **không** hook vào handler nào —
`p0-01` B3 #31 (chưa ai import `@megawin/guard`) vẫn phải đúng sau plan này.

⚠️ **Phải xong trước `p1-01`.** `p1-01` map `RateLimitDecision` ra HTTP header. Plan này **không**
đổi giá trị `remainingBurst` (Q2 = A). Việc vẫn chặn middleware là **object identity** của fail-open
(factory, không còn shared reference) và **contract** lower-bound đã khoá bằng R21 — middleware không
được "sửa" công thức Lua cho khớp canonical. Sửa sau khi middleware đã mutate decision thì dễ bẩn
state toàn process.

## Vì sao cần plan riêng, không sửa trực tiếp

`p0-01` đã đóng (Code ✅, Test ✅ 2026-09-22, có log `test/p0-01-part-b.out.txt`). Ba lý do tách plan:

1. Hai việc mức **P1** là **bug thật có đường tái hiện**, không phải refactor thẩm mỹ — cần test
   chứng minh trước/sau, cần ghi vào lịch sử quyết định.
2. Việc #2 (`ei = 0`) làm rate limit **bypass âm thầm** — đúng loại lỗi `guard` tồn tại để chống.
   Phải có test đỏ-trước-xanh-sau, không thể lẫn vào diff của plan khác.
3. Việc #5 (trần pha connect) là **quyết định đánh đổi**, không phải fix — cần chốt tường minh với
   người ra quyết định, không để agent tự chọn.

## Hiện trạng đã verify (đọc source, không suy đoán)

| Sự thật | Vị trí bằng chứng |
|---|---|
| `EVAL` **tự nạp** script vào script cache server → `SCRIPT LOAD` sau `EVAL` là RTT thừa | Chiến lược `_executeScript` của node-redis: EVALSHA → `NOSCRIPT` → EVAL, **không có** SCRIPT LOAD (`@redis/client/dist/lib/client/index.js:1108–1118`) |
| SHA1 tính **local** bằng `node:crypto`, không hỏi server | `scriptSha1()` — `@redis/client/dist/lib/lua-script.js` |
| node-redis nhận diện NOSCRIPT bằng `startsWith`, không `includes` | `client/index.js:1115` — `if (!err?.message?.startsWith?.('NOSCRIPT')) throw err;` |
| `DEFAULT_RESP = 3` ở `@redis/client@6.2.1` (v5 là 2) | `lib/RESP/types.js:5` |
| `client.eval(script, { keys, arguments })` đúng signature v6; `numkeys` do `pushKeysLength` tự sinh | `lib/commands/EVAL.js` |
| `computeGcraParams` **không** chặn `emissionIntervalMs = 0` | `packages/guard/src/rate-limit/gcra-math.ts:44` |
| `DEFAULT_RATE_LIMIT_BURST = 0` → `delayToleranceMs = 0` là đường mặc định | `packages/guard/src/constants.ts:32` |
| Pha `getClient()` **nằm ngoài** `withDeadline(250ms)` → trần thật là `5000 + 250` | `rate-limiter.ts:94–97` + `DEFAULT_REDIS_CONNECT_DEADLINE_MS = 5000` |
| `FAIL_OPEN_DECISION` là object **mutable dùng chung**; `RateLimitDecision` không có `readonly` | `rate-limiter.ts:49–54`, `types.ts:54–71` |
| `cachedGcraSha` là state module-level, **dùng chung giữa các `redisEnvKey` khác nhau** | `rate-limiter.ts:31` |

## Bảng việc cần làm

| # | Việc | File | Mức | Loại |
|---|---|---|---|---|
| 1 | SHA1 local (`node:crypto`), bỏ `cachedGcraSha` + `scriptLoad` khỏi hot path | `rate-limiter.ts` | **P1** | bug (RTT thừa + thrash chéo) |
| 2 | Clamp `emissionIntervalMs = max(1, …)` | `gcra-math.ts` | **P1** | bug (fail-open vĩnh viễn) |
| 3 | Clamp `ei < 1` → `1` trong Lua, rồi guard `px < 1` | `gcra.lua.ts` | **P1** | defense-in-depth |
| 4 | Sample `nowMs` **sau** `getClient()` | `rate-limiter.ts` | P2 | bug (deny oan) |
| 5 | ~~Trần pha connect~~ → **chỉ sửa JSDoc** (Q1 = B) | `rate-limiter.ts` + `constants.ts` | P2 | doc |
| 6 | `isNoscriptError`: `startsWith` thay `includes` | `rate-limiter.ts` | P2 | correctness |
| 7 | `FAIL_OPEN_DECISION` → factory | `rate-limiter.ts` | P2 | robustness |
| 8 | ~~Sửa `remainingBurst`~~ → **giữ công thức, chỉ JSDoc + khoá test** (Q2 = A) | `gcra.lua.ts` + `types.ts` | P3 | doc |
| 9 | JSDoc `{route}` → `<route>` | `gcra.lua.ts` | P3 | doc |

## Hai quyết định — ĐÃ CHỐT 2026-09-22

Cả hai chốt theo hướng **thay đổi tối thiểu**: không thêm hằng số mới, không đổi công thức Lua. Cả hai
đều là "sửa JSDoc + khoá bằng test" thay vì sửa hành vi. Lý do đầy đủ ở từng mục.

| Câu | Chốt | Hệ quả lên Phần A |
|---|---|---|
| Q1 — trần pha connect | **B** — giữ 5250ms, sửa JSDoc | Bước A5 **huỷ**. Thay bằng A5' (chỉ JSDoc) |
| Q2 — `remainingBurst` | **A** — giữ công thức, sửa JSDoc + khoá vector bằng test | Bước A2.2 đổi từ "sửa Lua" sang "chỉ JSDoc". Test R21 đảo mục đích |

### Q1 (việc #5) — Trần pha connect của `checkRateLimit` · **CHỐT: B**

`getClient()` cold start có thể tốn tới `DEFAULT_REDIS_CONNECT_DEADLINE_MS = 5000`. Comment hiện tại
biện minh "cùng lý do `RedisCacheStore.runCommand`" — lý do đó đúng với **cache** (miss rồi đi DB, chờ
connect vẫn có giá trị) nhưng **ngược** với rate limit (đã quyết fail-open thì chờ 5s để biết mình
fail-open là tệ hơn fail-open ngay ở 250ms).

| Phương án | Trần tổng | Đánh đổi |
|---|---|---|
| **A** — bọc `withDeadline(getClient(), RATE_LIMIT_CONNECT_DEADLINE_MS)`, hằng mới ~500ms | ~750ms | Cold start Lambda + Redis chậm → fail-open sớm hơn (mất phòng thủ đúng lúc traffic cao). Bù: circuit breaker vẫn hoạt động |
| **B** — giữ nguyên, **sửa JSDoc** nói rõ trần tổng = connect + command | 5250ms | Request đầu sau mỗi cửa sổ circuit 5s trả giá full. Không thêm hằng số mới |

**Chốt B.** Lý do quyết định: `withDeadline` **không huỷ được** `connect()` đang chạy (chỉ bỏ chờ —
`with-deadline.ts` JSDoc), nên A không thật sự cắt được công việc, chỉ cắt *lời hứa*: connect vẫn chạy
nền tới 5000ms. Đổi lại A thêm 1 hằng + 1 option + 1 nhánh log phải bảo trì, và nếu đặt thấp hơn
latency handshake thật tới Redis Cloud thì **mọi cold start fail-open** — mất phòng thủ đúng lúc Lambda
scale up (tức lúc đang bị tấn công). Với `p1-01` enforce ngay, fail-open sai thời điểm đắt hơn 5s
latency ở request đầu sau mỗi cửa sổ circuit 5s.

**Bước A5 huỷ.** Thay bằng **A5'** — chỉ sửa JSDoc cho khớp sự thật. JSDoc hiện tại của
`checkRateLimit` / `commandTimeoutMs` hàm ý trần là 250ms; đó là sai, và sai kiểu nguy hiểm: người đọc
sẽ tính budget Lambda dựa trên số đó.

### Q2 (việc #8) — Semantics `remainingBurst` · **CHỐT: A + khoá vector bằng test**

Lua hiện trả `floor((now - (new_tat - dt)) / ei)`. Canonical GCRA (với `dvt = dt + ei`) là
`(dvt - (new_tat - now)) / ei` = giá trị hiện tại **+ 1**.

**Đã mô phỏng đúng logic script (2026-09-22, `node`, đóng băng đồng hồ để tạo burst liên tiếp):**

`burst = 4`, `ei = 2000ms` → cho qua **5** request liên tiếp (khớp test `p0-01` #14):

| request | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| `allowed` | 1 | 1 | 1 | 1 | 1 | 0 |
| công thức hiện tại | 3 | 2 | 1 | 0 | **-1** | 0 |
| sau `Math.max(0, …)` ở `parseDecision` | 3 | 2 | 1 | 0 | **0** | 0 |
| canonical | 4 | 3 | 2 | 1 | 0 | 0 |

Ba kết luận **đo được**, không suy luận:

1. **Không có lỗi runtime.** `allowed` / `retryAfterMs` tính từ nhánh khác (`allow_at = tat - dt`),
   không dùng công thức này. Số request cho qua **đúng**.
2. **Clamp che đúng 1 trong 5 giá trị** — chỉ ô `-1` ở request cuối. Bốn giá trị `3,2,1,0` trả ra
   **nguyên vẹn**. Ở đúng ô bị clamp thì kết quả lại **đúng** (`0`).
3. **Với `burst: 0` — tức `DEFAULT_RATE_LIMIT_BURST` của repo — hai công thức cho kết quả GIỐNG NHAU**
   (đều `0`). Chênh lệch chỉ xuất hiện khi route khai `burst > 0`.

| Phương án | Ý nghĩa `remainingBurst` | Ảnh hưởng `p1-01` |
|---|---|---|
| **A** — giữ công thức, JSDoc ghi rõ đây là **lower bound** | Thấp hơn thực tế đúng 1 khi `burst > 0`; bằng canonical khi `burst = 0` | `X-RateLimit-Remaining` thấp hơn thực tế 1 → client backoff **sớm hơn**, không bao giờ muộn hơn |
| **B** — `+1` để khớp canonical | Khớp `throttled` / `redis-cell` | Đúng tuyệt đối, nhưng đổi hành vi để sửa một field chưa ai dùng |

**Chốt A.** Lệch theo hướng **thấp hơn thực tế** = phía an toàn cho cơ chế phòng thủ: client tự giới hạn
sớm hơn, không bao giờ vượt. `types.ts` cũng đã viết `"Burst còn lại **ước lượng**"` — từ "ước lượng"
đã hedge sẵn. Sửa Lua để làm đẹp một field **chưa có consumer nào** là đổi hành vi không đổi lấy giá trị.

**Nhưng chốt A chỉ hợp lệ khi kèm 2 việc bắt buộc** — nếu bỏ 1 trong 2 thì phải quay lại B:

1. **JSDoc nói rõ là lower bound** (Bước A2.2') — không để nó đọc như "biết lệch mà để đấy".
2. **Khoá vector bằng test** (R21 đảo mục đích): assert đúng dãy `3,2,1,0,0`. Không có test này, người
   sau đối chiếu `redis-cell` sẽ "sửa" thành canonical và phá contract vừa chốt — đúng loại thay đổi
   trông như bug-fix nên reviewer dễ approve.

---

# PHẦN A — CODE

> Chỉ code production. **Không** viết/sửa test trong Phần A. Kết thúc Phần A:
> `pnpm --filter @megawin/guard check-types` + `pnpm --filter @megawin/cache check-types` xanh,
> `oxlint packages/guard packages/cache` không error, `prettier --write` đã chạy.
> Test đỏ ở Phần B → quay lại đây, ghi `A-fix: <lý do>`.

## Bước A1 — `gcra-math.ts`: clamp `emissionIntervalMs` (việc #2)

Đường tái hiện bug: `{ limit: 2000, windowSec: 1 }` → `floor(1000/2000) = 0`. Với `burst` mặc định
`0` thì `dt = 0` → Lua tính `PX = new_tat - now + dt = 0` → Redis trả
`ERR invalid expire time in 'set' command` → script error → `catch` ngoài cùng → fail-open.
Route đó **mất rate limit hoàn toàn, mọi request, mãi mãi**, chỉ có `logError` làm dấu.

Cũng đạt được qua `windowSec` fractional: `{ limit: 1000, windowSec: 0.5 }` (type là `number`, không
chặn phân số).

```ts
// TRƯỚC
const emissionIntervalMs = Math.floor((rule.windowSec * 1000) / rule.limit);

// SAU
// Clamp sàn 1ms: ei = 0 làm Lua tính PX = 0 (Redis reject "invalid expire time") và chia 0 ở
// remainingBurst → script error → fail-open VĨNH VIỄN cho route đó. Đạt được khi
// limit > windowSec*1000 (VD limit 2000/1s). Trên 1000 req/s thì GCRA hết ý nghĩa thực tế
// (ei < 1ms không biểu diễn được bằng ms) → clamp thay vì throw, để cấu hình quá rộng không
// biến thành mất phòng thủ.
const emissionIntervalMs = Math.max(1, Math.floor((rule.windowSec * 1000) / rule.limit));
```

**Không** đổi `delayToleranceMs = burst * emissionIntervalMs` — nó tự đúng theo `ei` đã clamp.

## Bước A2 — `gcra.lua.ts`: clamp `ei`, guard `px`, JSDoc (việc #3, #8, #9)

### A2.1 Clamp `ei` rồi guard `px` (việc #3 — defense-in-depth)

Bước A1 đã chặn `ei = 0` ở tầng JS. Script vẫn phải tự chịu được ARGV bẩn: caller khác
(`repo.eval` trực tiếp, test R20) không đi qua `computeGcraParams`.

**Đo Redis 8.6.6 (2026-09-23, container `redis:8.6`) — guard `px` một mình là chưa đủ:**

| ARGV | Chỉ `if px < 1 then px = 1` | Hệ quả |
|---|---|---|
| `ei=0, dt=0` | Hết `ERR invalid expire time` | 2 lần gọi **cùng `now` trong 1 script** đều `allowed=1`. `new_tat = tat + 0` không tiến. TTL 1ms |
| `ei=0, dt=5000` | Nhánh `px < 1` **không chạy** (`px = 5000`) | Cả 2 lần `allowed=1`. `math.floor(5000/0)` thành `9223372036854775807` (inf → int64 max), **không** throw |
| `ei=0` + clamp `ei < 1 → 1` trong cùng script | Lần 2 `allowed=0`, TAT = `now+1` | Đúng GCRA sàn 1ms |

`0/0` trên Redis 8.6 **không** làm script error (`math.floor(0/0)` trả `0`). Đừng viết test kỳ vọng throw ở phép chia.

Clamp `ei` **ngay sau `tonumber`**, trước mọi phép tính. Giữ guard `px` làm lớp cuối (ARGV âm / `ceil` lệch).

```lua
local ei, dt = tonumber(ARGV[1]), tonumber(ARGV[2])
-- ei < 1 (kể cả 0 / nil / không parse được): TAT không tiến + PX 0 hoặc inf ở remainingBurst.
-- Sàn 1ms khớp clamp ở gcra-math.ts. Không đổi công thức remainingBurst phía dưới.
if ei == nil or ei < 1 then ei = 1 end
if dt == nil or dt < 0 then dt = 0 end
```

```lua
-- PX phải >= 1: Redis reject PX 0 ("invalid expire time") → script error → fail-open.
local px = math.ceil(new_tat - now + dt)
if px < 1 then px = 1 end
redis.call('SET', KEYS[1], new_tat, 'PX', px)
```

### A2.2' `remainingBurst` — **CHỈ JSDoc, KHÔNG đổi công thức** (việc #8, Q2 = A)

⚠️ **KHÔNG sửa dòng `return { 1, 0, math.floor(...) }`.** Đã chốt giữ công thức hiện tại (xem Q2 —
có bảng số mô phỏng). Nếu agent thấy công thức "lệch canonical" và tự sửa → **vi phạm plan**.

Thay vào đó, thêm comment ngay trên dòng `return` cuối:

```lua
-- remainingBurst = LOWER BOUND, không phải canonical GCRA.
-- Canonical là (dt + ei - (new_tat - now)) / ei = giá trị dưới đây + 1.
-- Đo 2026-09-22 (burst=4): trả 3,2,1,0,-1 thay vì 4,3,2,1,0; `parseDecision` clamp -1 → 0.
-- GIỮ NGUYÊN có chủ đích: lệch về phía THẤP hơn thực tế → client backoff sớm hơn, không bao
-- giờ muộn hơn (đúng hướng cho cơ chế phòng thủ). Với burst=0 (mặc định repo) hai công thức
-- cho kết quả GIỐNG NHAU. Vector 3,2,1,0,0 đã khoá bằng test R21 — đừng "sửa" thành canonical.
return { 1, 0, math.floor((now - (new_tat - dt)) / ei) }
```

Và sửa JSDoc field trong `packages/guard/src/types.ts`:

```ts
/**
 * Burst còn lại ước lượng sau lần gọi này — không âm.
 *
 * **Lower bound**: khi `rule.burst > 0`, thấp hơn canonical đúng 1 ở các request còn burst;
 * request được phép cuối cùng raw là `-1`, `parseDecision` kẹp về `0` nên trùng canonical.
 * `burst = 0` (mặc định) sau kẹp cũng là `0`. Lệch có chủ đích về phía an toàn — client backoff
 * sớm hơn, không bao giờ muộn hơn. Vector cụ thể xem test R21. **Đừng** "sửa" thành canonical
 * GCRA: đó là đổi contract, không phải fix bug.
 */
remainingBurst: number;
```

### A2.3 JSDoc (việc #9)

`{route}` / `{subjectType}` trong JSDoc đọc y như **hash tag của Redis Cluster** — người sau dễ tưởng
key thật có `{}` và suy luận sai về routing shard. Đổi sang `<route>`:

```
KEYS[1] = guard:rl:v1:<route>:<subjectType>_<hash(subjectId)>
```

Thêm 1 dòng ghi rõ điều đã verify: key thật **không** chứa `{}` (`hashKeyPart` trả hex thuần) → 1 key
duy nhất → cluster-safe không phụ thuộc hash tag.

## Bước A3 — `rate-limiter.ts`: SHA local, bỏ `scriptLoad` (việc #1)

Đây là thay đổi lớn nhất. Xoá `cachedGcraSha` (state module-level), thay bằng hằng số.

### A3.1 Thêm hằng SHA1

```ts
import { createHash } from "node:crypto";

/**
 * SHA1 của {@link GCRA_LUA_SCRIPT} — tính **local** bằng `node:crypto`, KHÔNG hỏi Redis.
 *
 * Đây đúng chiến lược của node-redis (`defineScript` + `_executeScript`,
 * `@redis/client/dist/lib/client/index.js:1108`): EVALSHA trước, `NOSCRIPT` → EVAL.
 * `EVAL` **tự nạp** script vào script cache của Redis nên `SCRIPT LOAD` là round-trip thừa.
 *
 * Hằng số thay cho biến cache vì SHA1 chỉ phụ thuộc text script (bất biến ở runtime) —
 * không có gì để invalidate, và không còn state dùng chung giữa các `redisEnvKey`.
 */
const GCRA_SHA1 = createHash("sha1").update(GCRA_LUA_SCRIPT).digest("hex");
```

Xoá hoàn toàn:

```ts
let cachedGcraSha: string | undefined;   // ← XOÁ
```

### A3.2 Viết lại `evalGcra`

```ts
/**
 * EVALSHA trước (1 RTT); `NOSCRIPT` → EVAL full script (script được nạp lại luôn).
 *
 * KHÔNG gọi `SCRIPT LOAD`: `EVAL` đã nạp script vào cache server, thêm `SCRIPT LOAD` chỉ là
 * 1 RTT thừa **nằm trong** budget `withDeadline` của caller.
 *
 * Không giữ state: cold start Lambda trên Redis đã có script (ca phổ biến nhất) chỉ tốn
 * **1 RTT** thay vì 2 như bản cũ (bản cũ không biết SHA nên luôn EVAL + SCRIPT LOAD).
 *
 * Cũng an toàn trên Redis Cloud **clustered**: không phụ thuộc việc proxy có broadcast
 * `SCRIPT LOAD` tới mọi shard hay không — `EVAL` nạp đúng shard đang giữ key.
 */
private async evalGcra(key: string, args: string[]): Promise<unknown> {
  const keys = [key];

  try {
    return await this.repo.evalSha(GCRA_SHA1, keys, args);
  } catch (err) {
    if (!isNoscriptError(err)) {
      throw err;
    }
    // Redis chưa có / vừa mất script cache (restart, SCRIPT FLUSH, failover shard).
    return await this.repo.eval(GCRA_LUA_SCRIPT, keys, args);
  }
}
```

Cập nhật JSDoc đầu file: xoá đoạn nói về cache SHA per-process kiểu `__redisClientCache__` — mô tả đó
không còn đúng.

### A3.3 `isNoscriptError` (việc #6)

```ts
/**
 * Redis trả error **prefix** `NOSCRIPT No matching script` khi SHA không có trong script cache.
 *
 * `startsWith` (KHÔNG `includes`) — khớp đúng cách node-redis tự kiểm tra
 * (`client/index.js:1115`). `includes` sẽ nuốt cả lỗi khác có chuỗi "NOSCRIPT" trong body và
 * fallback EVAL sai ngữ cảnh, che mất lỗi thật.
 */
function isNoscriptError(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith("NOSCRIPT");
}
```

## Bước A4 — `rate-limiter.ts`: thứ tự sample `nowMs` (việc #4)

`nowMs` đang lấy **trước** `getClient()`. Cold start / reconnect có thể tốn tới 5000ms → khi script
chạy, `now` trong ARGV đã cũ vài giây → `tat > now` → `now < allow_at` → **deny một request hợp lệ**.
Script đã tự bảo vệ hướng ngược lại (`if tat < now then tat = now end`) nhưng không thể bù `now` bị trễ.

```ts
// TRƯỚC
const nowMs = input.nowMs ?? Date.now();
const args = [...];
await this.repo.getClient();
const raw = await withDeadline(this.evalGcra(key, args), this.commandDeadlineMs, "…");

// SAU
await this.repo.getClient();

// Sample `now` MUỘN nhất có thể. connect/reconnect có thể tốn tới
// DEFAULT_REDIS_CONNECT_DEADLINE_MS; `now` cũ làm GCRA thấy tat > now → deny oan request hợp lệ.
const nowMs = input.nowMs ?? Date.now();
const args = [String(params.emissionIntervalMs), String(params.delayToleranceMs), String(nowMs)];
const raw = await withDeadline(this.evalGcra(key, args), this.commandDeadlineMs, "…");
```

Giữ `computeGcraParams` + `buildRateLimitKey` **trước** `getClient()`: cả hai là pure và **có thể
throw** (config sai / route chứa `:`) — throw sớm trước khi mở connection là đúng.

## Bước A5' — JSDoc trần thời gian cho khớp sự thật (việc #5, Q1 = B)

⚠️ **KHÔNG thêm `DEFAULT_RATE_LIMIT_CONNECT_TIMEOUT_MS`, KHÔNG thêm option `connectTimeoutMs`, KHÔNG
bọc `withDeadline` quanh `getClient()`.** Đã chốt B (xem Q1). Giữ nguyên `await this.repo.getClient()`.

Vấn đề còn lại là **JSDoc sai sự thật**: nó hàm ý trần một lần `checkRateLimit` là 250ms, trong khi
trần thật là `DEFAULT_REDIS_CONNECT_DEADLINE_MS + DEFAULT_RATE_LIMIT_TIMEOUT_MS` = **5250ms**. Người
đọc sẽ tính budget Lambda dựa trên số sai.

Sửa JSDoc class `RateLimiter` (hoặc `checkRateLimit`), thêm mục tường minh:

```
 * ## Trần thời gian: 250ms là của pha COMMAND, không phải của cả lời gọi
 *
 * | Pha | Trần | Hằng |
 * |---|---|---|
 * | connect/reconnect (`getClient`) | 5000ms | `DEFAULT_REDIS_CONNECT_DEADLINE_MS` (@megawin/cache) |
 * | command (EVALSHA/EVAL) | 250ms | `DEFAULT_RATE_LIMIT_TIMEOUT_MS` |
 * | **tổng worst-case** | **5250ms** | — |
 *
 * Pha connect KHÔNG bị bọc `withDeadline` riêng — quyết định có chủ đích (p0-01b Q1):
 * `withDeadline` chỉ bỏ **chờ**, không huỷ được `connect()` đang chạy, nên trần riêng chỉ cắt
 * *lời hứa* chứ không cắt công việc; đổi lại nếu đặt thấp hơn latency handshake thật tới Redis
 * Cloud thì MỌI cold start fail-open — mất phòng thủ đúng lúc Lambda scale up.
 *
 * Worst-case 5250ms chỉ trả giá ở request ĐẦU sau mỗi cửa sổ circuit (`REDIS_CIRCUIT_OPEN_MS`
 * = 5s); các request sau fail-open ~0ms nhờ circuit. Nếu đo thấy p99 thực tế không chấp nhận
 * được sau rollout → mở lại Q1, không tự đổi.
```

Sửa cả JSDoc `commandTimeoutMs` trong `RateLimiterOptions`: đổi "Trần mỗi lần check (ms)" thành
"Trần pha **command** (ms) — KHÔNG phủ pha connect, xem bảng ở JSDoc class".

`DEFAULT_RATE_LIMIT_TIMEOUT_MS` trong `constants.ts` cũng phải thêm 1 dòng: hằng này phủ **pha
command**, không phải cả `checkRateLimit`.

`logFailOpen` **không cần sửa** cho Q1 = B (chỉ có 1 pha dùng `withDeadline` nên `phase: "command"`
vẫn đúng).

## Bước A6 — `FAIL_OPEN_DECISION` → factory (việc #7)

`return FAIL_OPEN_DECISION` trả **cùng 1 reference** cho mọi caller. `p1-01` chỉ cần một dòng
`decision.remainingBurst = n` là hỏng hằng số toàn process, mọi request sau nhận giá trị bẩn —
`RateLimitDecision` không có `readonly` nên compiler im lặng.

```ts
// TRƯỚC
const FAIL_OPEN_DECISION: RateLimitDecision = { allowed: true, retryAfterMs: 0, remainingBurst: 0, failedOpen: true };

// SAU
/**
 * Quyết định fail-open chuẩn — dùng khi Redis lỗi / reply sai shape.
 *
 * **Factory, không phải hằng dùng chung**: `RateLimitDecision` không `readonly`, một caller
 * (middleware p1-01) gán `decision.remainingBurst` sẽ làm bẩn mọi request sau nếu trả shared
 * reference. Không `Object.freeze`: file ESM là strict mode, gán lên object đóng băng sẽ
 * **throw** giữa request — đổi bug bẩn state thành bug 500. Factory cho phép caller gán field
 * trên bản sao của riêng họ.
 */
function failOpenDecision(): RateLimitDecision {
  return { allowed: true, retryAfterMs: 0, remainingBurst: 0, failedOpen: true };
}
```

Thay cả 3 chỗ `return FAIL_OPEN_DECISION` → `return failOpenDecision()`.

## Bước A7 — Khoá kiến thức vào `RedisRepository` JSDoc

`scriptLoad` sau plan này **không còn caller nào** trong monorepo. **Giữ** method (primitive hợp lệ,
`p0-02` có thể cần) nhưng phải ghi cảnh báo, kẻo plan sau lặp lại đúng lỗi này.

`evalSha` hiện đang viết "caller bắt rồi fallback `eval` + `scriptLoad`" — đúng câu đã gây RTT thừa.
Sửa câu đó thành: fallback **chỉ** `eval` (EVAL tự nạp cache). Không để JSDoc của `evalSha` mâu thuẫn
với cảnh báo mới.

`packages/cache/src/redis/repository.ts`, JSDoc của `eval`, thêm:

```
 * ⚠️ `EVAL` **tự nạp** script vào script cache của Redis — sau lệnh này `evalSha` với SHA1 của
 * chính script đó đã hit. KHÔNG gọi `scriptLoad` sau `eval` (RTT thừa).
```

JSDoc của `scriptLoad`, thêm:

```
 * ⚠️ Hầu hết trường hợp **KHÔNG cần** method này. Pattern đúng (node-redis cũng làm vậy):
 * tính SHA1 local bằng `node:crypto` → `evalSha` → bắt `NOSCRIPT` → `eval` (tự nạp lại).
 * Xem `RateLimiter.evalGcra` (`packages/guard`). Chỉ dùng `scriptLoad` khi cần **preload** script
 * ở thời điểm tách rời lần chạy đầu (VD warmup job), không dùng trên hot path.
```

---

# PHẦN B — TEST

> **Không sửa `src/` ở Phần B.** Test đỏ = Phần A sai. Không `skip`/`todo` bất kỳ test nào.
> Numbering `R1…Rn` (R = review-fix) — tiếp nối, không trùng `#1–31` của `p0-01`.

## Nguyên tắc bắt buộc của plan này: mỗi test phải ĐỎ TRƯỚC KHI SỬA

Đây là plan sửa bug, không phải plan thêm tính năng. Test không đỏ trên code cũ thì **không chứng minh
được gì**. Với mỗi test có cột "Đỏ trên code cũ? ✅", quy trình là:

1. `git stash` phần A (hoặc checkout file `src/` về bản cũ) → chạy test → **phải đỏ**, ghi lại message.
2. Restore phần A → chạy lại → **phải xanh**.
3. Ghi cả 2 kết quả vào mục "Ghi chú thực thi Phần B".

Test **không** đỏ trên code cũ mà cột ghi ✅ → nghĩa là test viết sai, chưa chạm đúng bug. Sửa test,
đừng bỏ qua.

## B0 — Xác nhận môi trường

| # | Việc | Kỳ vọng | Nếu sai |
|---|---|---|---|
| B0a | `docker info` | Daemon chạy | Dừng — Phần B không chạy được |
| B0b | `docker exec <c> redis-cli INFO server \| grep redis_version` | `8.6.x` | Dừng — pin image bị lệch, kết luận vô nghĩa |
| B0c | `docker exec <c> redis-cli SET k 1 PX 0` | `ERR invalid expire time in 'set' command` | **Giả định nền của việc #2/#3 sai** → báo lại trước khi sửa Lua. Đây là điều review suy luận từ doc, chưa đo |
| B0d | `SCRIPT FLUSH` → `EVAL "return 1" 0` → `EVALSHA` với SHA1 **tính local** của đúng chuỗi `return 1` (`sha1sum` / `node:crypto`), không hard-code | `1` ở cả 2 lệnh | **Giả định nền của việc #1 sai** (EVAL không tự nạp cache) → dừng, plan phải viết lại |
| B0e | ~~Đo black-hole~~ — **HUỶ** (Q1 = B, không còn test trần connect) | — | — |

B0c + B0d là **bắt buộc ghi kết quả vào plan** — hai việc P1 lớn nhất dựa hoàn toàn vào 2 hành vi này.
Ghi lệnh + output nguyên văn, không ghi "OK".

SHA1 của `return 1` (không newline) là `e0e1f9fabfc9d4800c877a703b823ac0578ff8db`. Bản nháp từng ghi
`…ff831` — **sai**. Chạy EVALSHA với hash đó trả `NOSCRIPT` dù EVAL đã nạp script, và điều kiện
"nếu B0d sai thì dừng" sẽ abort oan. Đo 2026-09-23 trên `redis:8.6.6`: hash đúng → cả hai lệnh trả `1`.

## B1 — Unit test (PURE, không Redis, không Docker)

`pnpm --filter @megawin/guard test:unit`

### `test/unit/gcra-math.test.ts` — bổ sung vào file đã có

| # | Test | Assert | Đỏ trên code cũ? | Vì sao tồn tại |
|---|---|---|---|---|
| R1 | `{limit: 2000, windowSec: 1}` → `emissionIntervalMs === 1` | `toBe(1)` | ✅ (cũ trả `0`) | Đường tái hiện trực tiếp bug #2 |
| R2 | `{limit: 1000, windowSec: 0.5}` → `emissionIntervalMs === 1` | `toBe(1)` | ✅ (cũ trả `0`) | `windowSec` fractional — đường thứ 2 tới cùng bug, dễ bị bỏ sót |
| R3 | `emissionIntervalMs >= 1` với **mọi** case trong bảng vector | loop `toBeGreaterThanOrEqual(1)` | ✅ | Bất biến, không phải vector rời — chặn cả case tương lai |
| R4 | `{limit: 30, windowSec: 60}` vẫn `=== 2000` | `toBe(2000)` | ➖ (không regress) | Clamp **không được** đổi đường thường |
| R5 | `{limit: 2000, windowSec: 1, burst: 3}` → `delayToleranceMs === 3` | `toBe(3)` | ✅ (cũ trả `0`) | `dt` phải tính theo `ei` **đã clamp**, không phải `ei` gốc |

Giữ nguyên 6 test cũ (#1–6) — R4 là bản mở rộng có chủ đích, không thay thế.

### `test/unit/lua-script.test.ts` — bổ sung vào file đã có

| # | Test | Assert | Đỏ trên code cũ? | Vì sao tồn tại |
|---|---|---|---|---|
| R6 | Script clamp `ei` **trước** khi dùng, và guard `px` trước `SET` | `toMatch(/ei\s*<\s*1/)` + `toMatch(/px\s*<\s*1/)` + `toMatch(/'PX',\s*px/)` | ✅ | Khoá contract việc #3. Test yếu (regex text) nhưng rẻ; bằng chứng hành vi thật là R20 |
| R7 | Script **không** còn `math.ceil(new_tat - now + dt)` truyền trực tiếp vào `SET` | `not.toMatch(...)` | ✅ | Chặn việc "thêm guard nhưng quên dùng biến `px`" |
| R8 | JSDoc/comment **không** chứa `{route}` | `not.toMatch(/\{route\}/)` | ✅ | Việc #9 — `{}` đọc như cluster hash tag |
| R8b | Công thức `remainingBurst` **không** bị đổi thành canonical | `toMatch(/now\s*-\s*\(new_tat\s*-\s*dt\)/)` | ➖ | Q2 = A. Chốt giữ công thức → phải có test **chặn** việc sửa. Cặp với R21 (vector giá trị) |

Giữ nguyên #12–13. Lưu ý #13 (đếm `ARGV[n]` === 3) vẫn phải xanh — A2 không thêm ARGV nào.

### `test/unit/gcra-sha.test.ts` — **file mới**

| # | Test | Assert | Vì sao tồn tại |
|---|---|---|---|
| R9 | `GCRA_SHA1` là 40 hex chars lowercase | `toMatch(/^[0-9a-f]{40}$/)` | Sai format → `EVALSHA` luôn lỗi non-NOSCRIPT → fail-open vĩnh viễn, mà test Redis-sạch không bắt được |

`GCRA_SHA1` hiện là module-private. **Không** export chỉ để test — bằng chứng thật là R11 (so với SHA
do Redis 8.6 tự tính). Nếu muốn R9, export với JSDoc `@internal`; nếu không, bỏ R9 và dựa hoàn toàn
vào R11. Khuyến nghị: **bỏ R9, giữ R11** — Redis là oracle tốt hơn regex.

## B2 — Integration test (Redis 8.6 thật)

`pnpm --filter @megawin/guard test:integration` · `flushDb()` trong `beforeEach` (bắt buộc) ·
`fileParallelism: false`.

`cachedGcraSha` của code cũ là state module, sống xuyên file trong cùng worker Vitest. R13/R14 chỉ
**đỏ trên code cũ** khi chạy **đúng file đó trong process mới**
(`pnpm --filter @megawin/guard exec vitest run --project integration test/integration/rate-limiter-script.test.ts`),
không phải khi chạy cả suite sau `rate-limiter.test.ts` (SHA đã ấm → code cũ cũng EVALSHA, test xanh giả).
Code mới không còn state đó nên full suite vẫn là oracle đúng.

### `test/integration/script-cache-behavior.test.ts` — **file mới**

Khoá **hành vi nền tảng** mà việc #1 dựa vào. Không có file này thì fix #1 chỉ là niềm tin từ đọc
source node-redis.

| # | Test | Cách làm | Assert | Vì sao tồn tại |
|---|---|---|---|---|
| R10 | `EVAL` tự nạp script vào script cache | `client.scriptFlush()` → `repo.eval(GCRA_LUA_SCRIPT, [k], args)` → `repo.evalSha(sha, [k2], args)` | `evalSha` **không** throw | **Tiền đề của toàn bộ việc #1.** Nếu sai, bỏ `SCRIPT LOAD` là sai |
| R11 | SHA1 local === SHA Redis tự tính | `client.scriptLoad(GCRA_LUA_SCRIPT)` → so với SHA của `evalGcra` | `toBe(serverSha)` | Redis 8.6 làm oracle. Bắt mọi lệch do trailing whitespace / `.trim()` / encoding |
| R12 | `PX 0` bị Redis reject (giả định của việc #3) | `client.set("k", "1", { PX: 0 })` trong `expect(...).rejects` | `toThrow(/invalid expire time/i)` | Ghi lại **bằng chứng đo được** cho lý do tồn tại của guard `px`, không để nó thành "comment không ai kiểm chứng" |

R11 cần đọc được SHA mà `RateLimiter` dùng. Cách sạch nhất không mở API: spy
`RedisRepository.prototype.evalSha` để **capture** `sha` (arg đầu) rồi cho gọi tiếp original:

```ts
let capturedSha: string | undefined;
const spy = vi.spyOn(RedisRepository.prototype, "evalSha")
  .mockImplementation(async function (this: RedisRepository, sha, keys, args) {
    capturedSha = sha;
    return await evalShaOriginal.call(this, sha, keys, args);
  });
```

### `test/integration/rate-limiter-script.test.ts` — **file mới**

| # | Test | Cách làm | Assert | Đỏ trên code cũ? | Vì sao tồn tại |
|---|---|---|---|---|---|
| R13 | **Cold start trên Redis đã có script → đúng 1 RTT** | `client.scriptLoad(GCRA_LUA_SCRIPT)` trước; spy `evalSha`/`eval`/`scriptLoad`; gọi `checkRateLimit` 1 lần | `evalSha` gọi **1** lần · `eval` **0** lần · `scriptLoad` **0** lần | ✅ (cũ: `eval` 1 + `scriptLoad` 1) | **Test chứng minh chính của việc #1.** Đây là ca phổ biến nhất trên Lambda (nhiều cold start, Redis dùng chung) |
| R14 | `scriptLoad` **không bao giờ** được gọi ở mọi kịch bản | Spy `scriptLoad` ở cả 3 ca: cold / warm / sau `scriptFlush` | `not.toHaveBeenCalled()` ở cả 3 | ✅ | `p0-01` #21 chỉ assert ở ca warm → bug RTT thừa lọt qua |
| R15 | `SCRIPT FLUSH` → tự phục hồi trong **1** request | Rule **còn quota** (`limit: 5, windowSec: 60, burst: 4` — 2 lần gọi vẫn allowed). `checkRateLimit` → `client.scriptFlush()` → `checkRateLimit` | lần 2: `allowed: true`, `failedOpen: false`; `eval` gọi đúng **1** lần | ➖ | `SCRIPT FLUSH` **không** xoá key (đo 2026-09-23: `SET` rồi `SCRIPT FLUSH` → `GET` vẫn còn). `burst: 0` + ei lớn → lần 2 `allowed: false` dù script đã phục hồi, test đỏ oan. `flushAll` của `p0-01` #22 xoá cả data nên không tách được nhánh `NOSCRIPT` |
| R16 | `NOSCRIPT` + `scriptLoad` lỗi **không** kéo lần sau về EVAL | Warm 1 lần. Rồi spy: `evalSha` throw `NOSCRIPT…` **đúng 1 lần**, `scriptLoad` luôn reject. Gọi `checkRateLimit` (lần nhiễm). Bỏ spy `evalSha`. Gọi lần nữa | Lần sau: `evalSha` được gọi và **hit** (`eval` không gọi). `failedOpen: false` | ✅ | Hai env cùng một Redis **không** tái hiện bug: SHA là hash của text, script đã nạp thì cả hai EVALSHA hit, test xanh trên code cũ. Bug thật là `cachedGcraSha = undefined` khi `scriptLoad` fail — mọi request sau của process mất fast-path. Code mới không gọi `scriptLoad` và không có biến đó |
| R17 | `NOSCRIPT` giả — lỗi khác **có** chữ NOSCRIPT trong body → **không** fallback EVAL | Mock `evalSha` reject `new Error("WRONGTYPE ... NOSCRIPT ...")` | `eval` **không** được gọi · `failedOpen: true` | ✅ (cũ `includes` → fallback sai) | Việc #6. Lỗi thật bị che là loại bug tốn nhiều giờ debug nhất |
| R18 | `NOSCRIPT` thật → **có** fallback EVAL | Mock `evalSha` reject `new Error("NOSCRIPT No matching script")`, `eval` gọi original | `eval` được gọi · `failedOpen: false` · `allowed: true` | ➖ | Đối chứng của R17 — thiếu nó thì R17 pass cả khi fallback bị xoá hẳn |

### `test/integration/rate-limiter.test.ts` — bổ sung vào file đã có

| # | Test | Cách làm | Assert | Đỏ trên code cũ? | Vì sao tồn tại |
|---|---|---|---|---|---|
| R19 | **Rule `ei = 0` không làm mất rate limit** | `rule = {limit: 2000, windowSec: 1, burst: 100}` (`dt` sau clamp = 100ms, không phải 0). Gọi 3 lần. **Không** assert `pTTL >= 1` trên rule `burst: 0` | **`failedOpen: false` ở cả 3** · `pTTL(key) > 50` | ✅ (cũ: `ei=0`, `dt=0`, `PX 0` → `failedOpen: true`) | `burst: 0` sau clamp để lại TTL **1ms**. Đo 2026-09-23: `PTTL` ngay sau đó đã `-2` (key mất) — assert `>= 1` flake. `burst: 100` giữ key đủ lâu để đọc TTL, và code cũ vẫn `dt = burst * 0 = 0` nên vẫn đỏ. **Không** assert `allowed`: ei=1ms, timing quyết định deny |
| R20 | Clamp `ei` trong Lua hoạt động **độc lập** với clamp JS | Cùng một `now` cố định, gọi `repo.eval` **2 lần** với ARGV `["0", "0", now]` — bỏ qua `computeGcraParams`. Không dùng `pTTL` | Không throw · lần 1 `reply[0] === 1` · lần 2 `reply[0] === 0` | ✅ (cũ: `PX 0` throw; chỉ guard `px` thì cả 2 lần `allowed=1`) | Đo 2026-09-23: `px` clamp đơn độc hết lỗi Redis nhưng TAT không tiến, request sau vẫn qua. Lần 2 bị chặn mới chứng minh sàn `ei=1`. TTL 1ms làm `pTTL` flake — đừng assert |
| R21 | `remainingBurst` khớp **vector đã chốt** (Q2 = A) | `rule = {limit: 5, windowSec: 60, burst: 4}`; gọi 5 lần liên tiếp | Dãy **`[3, 2, 1, 0, 0]`** — xem ghi chú dưới bảng | ➖ (khoá hiện trạng) | **Đảo mục đích so với bản nháp.** Q2 chốt GIỮ công thức → test này khoá vector để người sau không "sửa" thành canonical. `p0-01` #17 chỉ assert "giảm dần + không âm" nên không chặn được |
| R22 | `nowMs` sample **sau** `getClient()` — assert trực tiếp | **Không** truyền `nowMs`. Spy `getClient` delay **300ms chỉ lần gọi đầu của chính `checkRateLimit`** (cài spy ngay trước lời gọi, counter); spy `evalSha` capture `args[2]` | `Number(capturedNow) >= tStart + 300` · `failedOpen: false` | ✅ | `eval`/`evalSha` cũng gọi `getClient`. Delay lần đó nằm **trong** `withDeadline(250ms)` → fail-open, test đo nhầm. Counter chỉ delay lần 1. Truyền `nowMs` thì assert thời gian vô nghĩa |
| R23 | Không deny oan sau connect chậm — assert hành vi | `rule = {limit: 1, windowSec: 1, burst: 0}`; gọi 1 lần (không spy). **Sau đó** mới spy `getClient` delay 1200ms ở lần 1 của lời gọi thứ 2 | lần 2 `allowed: true` **và** `failedOpen: false` | ✅ (cũ: `allowed: false`) | Chỉ `allowed: true` thì delay lọt vào `withDeadline` cũng xanh (fail-open). `failedOpen: false` khoá đúng bug #4 |

⚠️ **R21 — vector chính xác và cái bẫy timing.** Mô phỏng (đồng hồ đóng băng) cho `3,2,1,0,-1→0`.
Nhưng test thật chạy trên đồng hồ **đang chạy**: `ei = 12000ms` (`60s/5`) lớn hơn nhiều so với thời gian
5 lời gọi (~vài ms), nên `now` nhích không đủ để đổi bậc → vector thật **là** `[3, 2, 1, 0, 0]`.

Để loại hoàn toàn rủi ro timing, **truyền `nowMs` cố định** (field đã có sẵn trong `RateLimitInput`,
JSDoc ghi rõ "bắt buộc inject trong unit test để deterministic"):

```ts
const now = Date.now();
const got: number[] = [];
for (let i = 0; i < 5; i++) {
  const d = await limiter.checkRateLimit({ route: ROUTE, subject: SUBJECT_A, rule, nowMs: now });
  expect(d.allowed).toBe(true);
  got.push(d.remainingBurst);
}
expect(got).toEqual([3, 2, 1, 0, 0]);   // ← vector đã chốt (Q2 = A), KHÔNG phải canonical 4,3,2,1,0
```

Comment trong test phải ghi: giá trị này là **lower bound có chủ đích**, canonical là `+1`; đỏ ở đây
nghĩa là ai đó đã đổi công thức Lua — đọc Q2 của plan này trước khi "sửa" test. `repo.evalSha`/`repo.eval` **cũng** gọi `getClient()` bên trong. Delay
vô điều kiện sẽ làm `evalGcra` vượt `withDeadline(250ms)` → fail-open → test đo sai thứ. Bắt buộc dùng
counter, chỉ delay lần gọi **đầu tiên**:

```ts
let calls = 0;
vi.spyOn(RedisRepository.prototype, "getClient").mockImplementation(async function (this: RedisRepository) {
  calls += 1;
  if (calls === 1) {
    await sleep(300);   // chỉ pha connect ở checkRateLimit, không phải lời gọi trong evalSha
  }
  return await getClientOriginal.call(this);
});
```

### `test/integration/rate-limiter-fail-open.test.ts` — bổ sung vào file đã có

| # | Test | Cách làm | Assert | Đỏ trên code cũ? | Vì sao tồn tại |
|---|---|---|---|---|---|
| R24 | Fail-open trả **object mới** mỗi lần | 2 lời gọi trên env broken | `expect(a).not.toBe(b)` · `expect(a).toEqual(b)` | ✅ (cũ: cùng reference) | Việc #7 |
| R25 | Mutate decision **không** làm bẩn lời gọi sau | Gọi → `d.remainingBurst = 99` → gọi lại | lần 2 `remainingBurst === 0` | ✅ | Đây là ca thật sẽ xảy ra ở `p1-01` (middleware gán field) |
| R26 | ~~Trần pha connect~~ — **HUỶ** (Q1 = B) | — | — | — | Q1 chốt giữ 5250ms → không có trần riêng để test. `p0-01` #24 (`< DEFAULT_REDIS_CONNECT_DEADLINE_MS`) vẫn là assert đúng và đã xanh |
| R26' | JSDoc trần thời gian khớp hằng số thật | Unit test `readFileSync` `rate-limiter.ts`, assert file chứa cả `DEFAULT_REDIS_CONNECT_DEADLINE_MS` và `DEFAULT_RATE_LIMIT_TIMEOUT_MS`, và **không** khẳng định cả `checkRateLimit` trần 250ms. Cộng hai hằng trong code (`5000+250`) chỉ là assert phụ — **không** đủ để khoá JSDoc | file source nhắc đủ 2 hằng ở JSDoc class | ➖ | Bản nháp "assert tổng === 5250" không đọc JSDoc: đổi comment mà quên số, test vẫn xanh; đổi hằng thì đỏ dù JSDoc đã sửa. Phải đọc source |

Giữ nguyên #23–27. Lưu ý #27 (reply sai shape) mock **cả** `evalSha` và `eval` → vẫn xanh sau A3 vì
`evalSha` được gọi trước và trả rác → `parseDecision` fail-open. Không cần sửa.

## B3 — Không regress

| # | Lệnh | Kỳ vọng |
|---|---|---|
| R27 | `pnpm --filter @megawin/guard test:unit` | **Toàn bộ** xanh — 13 cũ + R1–R8 mới |
| R28 | `pnpm --filter @megawin/guard test:integration` | **Toàn bộ** xanh — 14 cũ vẫn còn, cộng R10–R25 (R26 đã huỷ, R26' nằm ở unit). Số passed **lớn hơn** 14 của `p0-01`, không được nhỏ hơn |
| R29 | `pnpm --filter @megawin/cache test` | Xanh — A7 sửa JSDoc `repository.ts` (chỉ comment, nhưng phải chạy) |
| R30 | `pnpm --filter @megawin/guard build` + `pnpm check-types` | Xanh toàn repo |
| R31 | `oxlint packages/guard packages/cache` | **0 error.** `node:crypto` import mới phải hợp lệ; warning mới → nêu trong summary, không tự tắt rule |
| R32 | `rg -n "scriptLoad" packages/ apps/ --glob '!**/dist/**' --glob '!**/node_modules/**'` | Chỉ còn: định nghĩa ở `repository.ts` + spy trong test. **Không** có call-site production |
| R33 | `rg -n "cachedGcraSha\|FAIL_OPEN_DECISION" packages/guard/src` | **Không kết quả** — xác nhận đã xoá hẳn, không để lại code chết |
| R34 | `rg -l "@megawin/guard" apps/ packages/ --glob '!packages/guard/**'` | **Không kết quả** — plan này vẫn chưa đổi hành vi runtime (bất biến từ `p0-01` #31) |

## B4 — Xác nhận thủ công (đo số thật, không suy luận)

| # | Việc | Cách đo | Kỳ vọng | Ghi gì vào plan |
|---|---|---|---|---|
| R35 | **Đếm RTT thật** cho cold start trên Redis đã có script | `redis-cli MONITOR` ở terminal riêng → chạy script `tsx` gọi `checkRateLimit` **1 lần** trong process mới (`node` mới, không phải vitest) | MONITOR thấy **đúng 1** dòng `EVALSHA` — **không** có `EVAL`, **không** có `SCRIPT LOAD` | Paste nguyên văn output MONITOR |
| R36 | Latency trước/sau | Lặp 20 lần, lấy trung bình + p99; so với `p0-01` B4 (**avg 0.6ms**) | Không tệ hơn. Cold start phải **tốt hơn** (2 RTT → 1) | 2 con số cụ thể |
| R37 | Bypass check — rule `ei = 0` trên Redis thật | `{limit: 2000, windowSec: 1, burst: 0}`, gọi 50 lần | `failedOpen: false` ở **cả 50** lần (trước fix: `true` ở cả 50) | Số lần `failedOpen: true` (phải là 0) |
| R38 | Blip lại (regression của `p0-00` A2) | Redis sống → gọi OK → `docker stop` → gọi (fail-open nhanh) → `docker start` → chờ circuit 5s → gọi lại | Lần cuối `failedOpen: false` **không cần** restart process | Kết quả từng bước |
| R39 | Key vẫn không lộ PII | `redis-cli --scan --pattern 'guard:*'` | Chỉ `ip_<hex>` — không IP/accountId nguyên bản | Mẫu 2–3 key |
| R40 | ~~Trần connect thật~~ — **HUỶ** (Q1 = B) | — | — | — |

R35 là **bằng chứng quyết định** cho việc #1. Test R13 dùng spy ở tầng JS; MONITOR nhìn từ phía Redis
— nếu 2 cái mâu thuẫn, tin MONITOR.

## Definition of done

**Quyết định:**

- [x] Q1 (trần pha connect) — **B**: giữ 5250ms, chỉ sửa JSDoc. Chốt bởi user 2026-09-22.
- [x] Q2 (`remainingBurst`) — **A**: giữ công thức, JSDoc ghi lower bound + khoá vector bằng R21/R8b.
      Chốt bởi user 2026-09-22 sau khi xem bảng mô phỏng (clamp chỉ che 1/5 giá trị; `burst=0` hai
      công thức giống nhau; lệch về phía an toàn).

**Phần A (code):**

- [x] A1: `gcra-math.ts` clamp `max(1, …)`, JSDoc ghi rõ **hậu quả** của `ei = 0` (không chỉ "clamp").
- [x] A2.1: Lua clamp `ei < 1` → `1` (và `dt < 0` → `0`) **trước** phép tính; vẫn có `px` guard. Không chỉ `px`.
- [x] A2.2': Lua **KHÔNG** đổi công thức `remainingBurst`; đã thêm comment "lower bound có chủ đích";
      `types.ts` JSDoc đã ghi. ⚠️ Đổi công thức = vi phạm plan.
- [x] A2.3: JSDoc dùng `<route>` không `{route}`.
- [x] A3: `GCRA_SHA1` hằng tính local; `cachedGcraSha` **xoá hẳn**; `scriptLoad` **không** còn trong
      `evalGcra`; `isNoscriptError` dùng `startsWith`.
- [x] A4: `nowMs` sample **sau** `getClient()`; `computeGcraParams`/`buildRateLimitKey` vẫn trước.
- [x] A5': JSDoc bảng 3 dòng (connect 5000 / command 250 / tổng 5250) + lý do Q1=B.
      ⚠️ **KHÔNG** thêm hằng/option/`withDeadline` cho pha connect.
- [x] A6: `failOpenDecision()` factory; **cả 3** `return` đã đổi.
- [x] A7: JSDoc `eval` + `scriptLoad` + **`evalSha`** (bỏ câu "fallback eval + scriptLoad") trong `repository.ts`.
- [x] JSDoc đầu `rate-limiter.ts` đã sửa (bỏ mô tả cache SHA per-process — không còn đúng).
- [x] `check-types` + `oxlint` + `prettier --write` xanh.

**Phần B (test):**

- [x] B0a–B0d xong; **B0c + B0d ghi output nguyên văn** (2 giả định nền của P1). B0e đã huỷ.
- [x] R1–R8b unit xanh; R1, R2, R5, R6, R7, R8 đã verify **đỏ trên code cũ**.
- [x] R10–R12 (`script-cache-behavior`) xanh — tiền đề của việc #1 đã đo, không còn là niềm tin.
- [x] R13–R18 (`rate-limiter-script`) xanh; R13, R14, R16, R17 đã verify **đỏ trên code cũ**.
- [x] R19–R23 xanh. **R20** gọi Lua trực tiếp 2 lần cùng `now`: lần 2 `allowed=0` (clamp `ei`, không chỉ hết throw). **R19** không assert `pTTL` trên TTL 1ms. **R21** dùng `nowMs` cố định, assert `[3, 2, 1, 0, 0]`. **R23** assert cả `failedOpen: false`.
- [x] R24, R25, R26' xanh. R26 đã huỷ.
- [x] R27–R34 (không regress) xanh; R32/R33/R34 xác nhận không còn code chết / chưa có consumer.
- [x] R35 có output MONITOR chứng minh **1 RTT**; R37 có số `failedOpen: true` = 0/50. R40 đã huỷ.
- [x] Mọi `A-fix` phát sinh đã ghi lại.

## Ghi chú thực thi

> Agent điền khi làm. Ghi **số đo và output nguyên văn**, không ghi "OK"/"đã xong".

### Quyết định (2026-09-22)

- **Q1 = B** — giữ trần tổng 5250ms, chỉ sửa JSDoc. Lý do: `withDeadline` không huỷ được `connect()`
  nên trần riêng chỉ cắt lời hứa; đặt thấp hơn handshake thật tới Redis Cloud → mọi cold start
  fail-open, mất phòng thủ đúng lúc Lambda scale up. Bước A5 → A5' (chỉ doc); R26, R40, B0e huỷ.
- **Q2 = A** — giữ công thức `remainingBurst`. Bảng mô phỏng (`node`, đồng hồ đóng băng, burst=4):

  | request | 1 | 2 | 3 | 4 | 5 | 6 |
  |---|---|---|---|---|---|---|
  | `allowed` | 1 | 1 | 1 | 1 | 1 | 0 |
  | hiện tại | 3 | 2 | 1 | 0 | -1 | 0 |
  | sau clamp | 3 | 2 | 1 | 0 | 0 | 0 |
  | canonical | 4 | 3 | 2 | 1 | 0 | 0 |

  Không có lỗi runtime (`allowed`/`retryAfterMs` từ nhánh khác); clamp chỉ che ô `-1` và ở đúng ô đó
  kết quả lại đúng; `burst=0` (mặc định repo) hai công thức **giống nhau**; lệch về phía thấp hơn =
  phía an toàn. Bước A2.2 → A2.2' (chỉ doc); R21 đảo mục đích thành khoá vector; thêm R8b.

### Review trước khi code (2026-09-23)

Đo trên container `redis:8.6.6` (`crazy_heisenberg`), đối chiếu source `rate-limiter.ts` /
`gcra.lua.ts` / `@redis/client@6.2.1`:

- `SET PX 0` → `ERR invalid expire time`. Đúng giả định việc #2/#3.
- `EVAL "return 1"` rồi `EVALSHA` hash đúng `…ff8db` → `1`. Hash nháp `…ff831` → `NOSCRIPT` giả.
  Việc #1 (bỏ `SCRIPT LOAD`) đứng. B0d không được hard-code hash sai.
- Chỉ guard `px` khi `ei=0`: hết lỗi Redis, nhưng 2 lần cùng `now` đều allowed. `ei=0, dt=5000`
  còn trả remainingBurst `9223372036854775807`. Đã nâng A2.1 thành clamp `ei` trong Lua.
- `SCRIPT FLUSH` không xoá key. `PTTL` của key PX 1ms đo được `-2`. Đã sửa R15/R19/R20/R23/R26'.

### Phần A

Thực thi 2026-09-23. `check-types` `@megawin/guard` + `@megawin/cache` xanh. `oxlint packages/guard packages/cache` 0 error. `prettier --write` không đổi. `GCRA_SHA1` không export (R9 bỏ, dựa R11). Không thêm hằng connect, không đổi công thức `remainingBurst`.

### Phần B

**B0** — container `crazy_heisenberg` / `redis:8.6.6`:

```
# B0b
redis_version:8.6.6

# B0c
$ docker exec crazy_heisenberg redis-cli SET k 1 PX 0
ERR invalid expire time in 'set' command

# B0d
$ docker exec crazy_heisenberg redis-cli SCRIPT FLUSH
OK
$ docker exec crazy_heisenberg redis-cli EVAL "return 1" 0
1
$ node -e "createHash('sha1').update('return 1').digest('hex')"
e0e1f9fabfc9d4800c877a703b823ac0578ff8db
$ docker exec crazy_heisenberg redis-cli EVALSHA e0e1f9fabfc9d4800c877a703b823ac0578ff8db 0
1
```

**Đỏ trên code cũ → xanh sau sửa** (restore `src/` p0-01, chạy đúng test, rồi restore Phần A):

| # | Message đỏ trên code cũ | Xanh sau A |
|---|---|---|
| R1 | `expected +0 to be 1` (`emissionIntervalMs`) | ✅ |
| R2 | `expected +0 to be 1` | ✅ |
| R5 | `expected +0 to be 3` (`delayToleranceMs`) | ✅ |
| R6 | `expected '…' to match /ei\s*<\s*1/` | ✅ |
| R7 | `expected '…' not to match /SET',\s*KEYS\[1\],\s*new_tat,\s*'PX',\s*math\.ceil/` | ✅ |
| R8 | `expected '…' not to match /\{route\}/` | ✅ |
| R13 | isolated file: `expected "evalSha" to be called 1 times, but got 0 times` | ✅ |
| R14 | isolated file: `expected "scriptLoad" to not be called at all, but actually been called 1 times` | ✅ |
| R16 | `expected "evalSha" to be called at least once` (lần sau rơi EVAL) | ✅ |
| R17 | `expected false to be true` (`failedOpen` — `includes` fallback EVAL) | ✅ |
| R19 | `expected true to be false` (`failedOpen`) | ✅ |
| R20 | `ERR invalid expire time in 'set' command script: e58788ef…, on @user_script:13` | ✅ |
| R22 | `expected 1790164436828 to be greater than or equal to 1790164437128` (lệch đúng 300ms) | ✅ |
| R23 | lần 1 (không `pExpire`): **xanh giả** — xem A-fix. Sau `pExpire`: `expected false to be true` (`allowed`) | ✅ |
| R24 | `expected {…} not to be {…}` (cùng reference) | ✅ |
| R25 | `expected 99 to be +0` | ✅ |

**A-fix: R23** — test viết theo plan (`burst: 0`, delay 1200ms) **không đỏ** trên code cũ: `PX = ei = 1000ms` < delay → key hết hạn trước khi script chạy, GET miss, TAT = ARGV now → cả cũ lẫn mới ALLOW. Sửa test: `pExpire(key, 10_000)` sau lần 1 để giữ TAT. Sau đó đỏ đúng (`allowed: false` khi `nowMs` sample trước `getClient`).

**B3**

- R27: `test:unit` **23 passed** (4 files)
- R28: `test:integration` **30 passed** (4 files) — p0-01 là 14
- R29: `@megawin/cache test` **75 passed**
- R30: `guard build` + `guard`/`cache` `check-types` xanh
- R31: oxlint 0 error
- R32: `scriptLoad` chỉ còn định nghĩa + JSDoc `repository.ts` + spy/preload trong test
- R33: `cachedGcraSha` / `FAIL_OPEN_DECISION` — không kết quả
- R34: không consumer `@megawin/guard` ngoài package

**B4**

R35 MONITOR (process `tsx` mới, Redis đã có script). **Đúng 1 EVALSHA, 0 EVAL, 0 SCRIPT LOAD:**

```
1790164644.067364 [0 192.168.65.1:44857] "HELLO" "3"
1790164644.067391 [0 192.168.65.1:44857] "CLIENT" "SETINFO" "LIB-VER" "6.2.1"
1790164644.067395 [0 192.168.65.1:44857] "CLIENT" "SETINFO" "LIB-NAME" "node-redis"
1790164644.069701 [0 192.168.65.1:44857] "EVALSHA" "4cc9b12f157e896d651b701ca8346d4bbaa141c4" "1" "guard:rl:v1:p001b.r35:ip_0c25434b09c62046" "2000" "8000" "1790164644069"
1790164644.069744 [0 lua] "GET" "guard:rl:v1:p001b.r35:ip_0c25434b09c62046"
1790164644.069767 [0 lua] "SET" "guard:rl:v1:p001b.r35:ip_0c25434b09c62046" "1790164646069" "PX" "10000"
```

R36 latency 20 lần process mới (ms, đã sort): mẫu đầu = cold connect **14.34**; 19 lần ấm avg **0.45** / p99 **0.82**. Cả 20: avg 1.14 / p99 14.34. Ấm **không tệ hơn** p0-01 B4 (avg 0.6). Cold 1 RTT (R35), không còn `SCRIPT LOAD`.

R37 `{limit: 2000, windowSec: 1, burst: 0}` × 50: **`failedOpen: true` = 0/50**.

R38 cùng process: step1 `failedOpen: false` → `docker stop` → step2 `failedOpen: true` **4ms** → `docker start` (host port remap 55002→55003, cập nhật `REDIS_URI`) → chờ circuit 5.5s → step3 **`failedOpen: false`**, không restart process.

R39 scan `guard:*`: chỉ `ip_<hex>` — VD `guard:rl:v1:p001b.r36.0:ip_0c25434b09c62046`. Không IP/accountId nguyên bản.

## Không làm trong plan này (chống scope creep)

- ❌ Chuyển sang `defineScript` + `createClient({ scripts })` — cách idiomatic nhất của node-redis (tự
  lo SHA1 + NOSCRIPT), nhưng phải khai script tại `createClient`, tức `@megawin/cache/redis/client.ts`
  — một factory generic sẽ phải biết về script của `@megawin/guard`. **Đảo ngược phụ thuộc, sai
  layering.** Giữ manual ở `guard`, chỉ copy đúng chiến lược của `_executeScript`.
- ❌ Chuyển sang **Redis Functions** (`FUNCTION LOAD`). Redis 8.6 hỗ trợ, function sống qua
  `SCRIPT FLUSH` + được persist/replicate → nghe như xoá hẳn nhánh `NOSCRIPT`. Nhưng nó đổi `NOSCRIPT`
  thành bài toán **deploy/versioning library** (ai load, lúc nào, rollback sao khi nhiều version
  Lambda chạy song song) — đắt hơn hẳn 4 dòng fallback. Xem lại nếu có ≥3 script chia sẻ.
- ❌ Thêm `disableOfflineQueue` vào `createClient` — thuộc `p0-02` (lock/idempotency), nơi
  double-write là rủi ro thật. Rate limit fail-open thì lệnh chạy muộn vô hại.
- ❌ Tách `REDIS_RATELIMIT_URI` — MVP dùng chung `REDIS_URI` (analysis §5.3). Việc #1 (bỏ state dùng
  chung) chỉ **chừa đường** cho việc đó, không thực hiện nó.
- ❌ Đổi `DEFAULT_RATE_LIMIT_TIMEOUT_MS` (250ms) — chỉ điều chỉnh sau khi `p2-01` có số `failedOpen`
  thật. Plan này không đoán thêm.
- ❌ Hook vào `buildHandler`, middleware, metrics — `p1-01` / `p2-01`.
