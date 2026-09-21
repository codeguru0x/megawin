---
name: ""
overview: ""
todos: []
isProject: false
---

# p0-00 — Sửa fail-open của `@megawin/cache` ở tầng connect

> Overview: `./00-overview.md` · Phase P0 · Chặn: `p0-01` (và qua đó mọi plan còn lại)
> Bằng chứng: đo thực tế `redis@6.2.1` ngày 2026-09-21 (mục "Bằng chứng" bên dưới)

`@megawin/cache` **tự nhận là fail-open nhưng thực tế không phải**. Khi Redis không tới được,
`RedisCacheStore.get()` **treo tới khi Lambda timeout** thay vì degrade về cache-miss. Plan này vá
lỗ đó **trước** khi `@megawin/guard` được dựng, vì toàn bộ thiết kế fail-open của guard (`p0-01`
Bước 3.4) đứng trên giả định sai này.

**Đây không phải tối ưu hiệu năng.** Đây là bug làm Redis chết = outage toàn hệ thống — đúng ngược
lại điều `redis-store.ts` hứa trong JSDoc.

## Bằng chứng (đã đo, không suy đoán)

### Cơ chế hiện tại

| Sự thật | Vị trí |
|---|---|
| `commandOptions.timeout` chỉ tạo `AbortSignal.timeout()` **lúc enqueue command** | `@redis/client/dist/lib/client/commands-queue.js:216-228` |
| `RedisRepository.getClient()` phải `await getRedisClient()` **TRƯỚC** khi command được enqueue → timeout 300ms chưa có hiệu lực trong giai đoạn connect | `packages/cache/src/redis/repository.ts:62` |
| `getRedisClient()` `await createClient({url}).connect()`, **không** truyền `socket` options | `packages/cache/src/redis/client.ts:76-79` |
| `connectTimeout` default **5000ms** | `client/socket.js:45` |
| `defaultReconnectStrategy` retry **VÔ HẠN**: `min(2^retries * 50, 2000) + jitter(0-200)`. Chỉ trả `false` khi cause là `SocketTimeoutError` — mà `socketTimeout` **không được set** nên case đó không xảy ra | `client/socket.js:403-413` |
| `#connect()` loop `do…while (isOpen && !isReady)` → **không bao giờ** thoát khi Redis down | `client/socket.js:173-229` |
| Client chỉ được cache **sau khi** connect thành công → mỗi request trả giá lại từ đầu | `packages/cache/src/redis/client.ts:80` |
| `DEFAULT_COMMAND_TIMEOUT = 5000` | `@redis/client/dist/lib/defaults.js:5` |

### Đo thực tế — `connect()` KHÔNG BAO GIỜ reject

Probe `redis@6.2.1` trỏ port đóng (`redis://127.0.0.1:6399`), cấu hình **giống hệt** `client.ts`
hiện tại (chỉ `{ url }`, không `socket` options):

```
[12ms]    error event: connect ECONNREFUSED 127.0.0.1:6399
[147ms]   error event: connect ECONNREFUSED 127.0.0.1:6399
[281ms]   error event: connect ECONNREFUSED 127.0.0.1:6399
[622ms]   → 1193ms → 2044ms → 3662ms → 5833ms → 7960ms → 10109ms  (retry vô hạn)
[12015ms] KẾT LUẬN: settled=false → TREO (không reject)
```

**Hệ quả:** `try/catch` fail-open ở `redis-store.ts:86` **không bao giờ chạy** vì `await` phía trên
nó chưa bao giờ settle. JSDoc `client.ts:5` ghi *"FAIL-FAST: throw khi thiếu env hoặc connect lỗi"* —
chỉ đúng với **thiếu env**.

### Đo thực tế — cách sửa có hiệu quả

```
A reconnectStrategy=false          : REJECTED sau  13ms
B connectTimeout 300 + max 2 retry : REJECTED sau 113ms
```

→ Truyền `socket.reconnectStrategy` là điều kiện **đủ** để connect fail-fast.

### Lỗ thứ hai: 16/21 method dùng default 5000ms

`RedisRepository` có 21 method public; chỉ `get`/`set`/`getJson`/`setJson`/`delete` nhận
`commandOptions`. Các method còn lại (`incrBy`, `hGet`, `hmGet`, `hIncrBy`, `sAdd`, `sIsMember`,
`zAdd`, `zScore`, `zIncrBy`, `zRange`, `zRangeWithScores`, `zRangeByScore`, `zRemRangeByScore`,
`zRem`, `zCard`, `zRank`, `exists`, `expire`, `pExpire`, `ttl`, `multi`) **không có cách nào** hạ
timeout → `p0-01` thêm `eval`/`evalSha` mà không sửa chỗ này thì rate limit vẫn có thể chờ 5s.

## Mục tiêu

1. `getRedisClient()` **thật sự** fail-fast khi Redis không tới được (< 500ms, không treo).
2. Lỗi connect **không** trả giá lại mỗi request (negative cache / circuit breaker ngắn).
3. **Mọi** method của `RedisRepository` nhận được `commandOptions`.
4. Có deadline **tổng** (connect + command) để caller đặt được trần thời gian thật sự.
5. Test chứng minh cả 4 điều trên — **đặc biệt** test "Redis down → trả về nhanh, không throw".

---

# PHẦN A — CODE (AI agent implement)

> **Quy tắc phân tách:** Phần A chỉ viết **code production**. KHÔNG viết test trong Phần A.
> Điều kiện kết thúc Phần A: `pnpm --filter @megawin/cache check-types` xanh + `oxlint` không error.
> Sang Phần B mới viết test. **Khi Phần B đỏ, KHÔNG được sửa test để nó xanh** — quay lại Phần A,
> ghi rõ "A-fix: <lý do>" vào phần ghi chú thực thi.

## A1 — Hằng số mới trong `constants.ts`

File: `packages/cache/src/constants.ts`. Thêm 4 hằng, mỗi hằng **bắt buộc** có JSDoc giải thích
**công thức** và **vì sao con số đó** (chuẩn `code-quality-standards.mdc` §1–2). Giữ nguyên
`DEFAULT_REDIS_COMMAND_TIMEOUT_MS = 300`.

| Hằng | Giá trị khởi điểm | Ràng buộc bắt buộc ghi trong JSDoc |
|---|---|---|
| `DEFAULT_REDIS_CONNECT_TIMEOUT_MS` | `1000` | Trần **một lần** TCP(+TLS) handshake. Rộng hơn command timeout vì handshake TLS cross-AZ có thể ~200ms; trả giá 1 lần/process, không phải mỗi request |
| `DEFAULT_REDIS_CONNECT_MAX_RETRIES` | `1` | Số lần thử LẠI (tổng = 1 + 1 = 2 lần). **KHÔNG được đặt 0** — xem A2 về `#onSocketError` |
| `DEFAULT_REDIS_CONNECT_DEADLINE_MS` | `2500` → **`1500` (A9)** | Backstop cứng cho toàn bộ pha connect. **Công thức cũ đã BỎ** (`CONNECT_TIMEOUT × (1 + MAX_RETRIES) + backoff + jitter` = 2400 → 2500): nhân theo retry làm black-hole tốn 2500ms vô ích. Công thức mới: `CONNECT_TIMEOUT(1000) + RESP handshake(~400) + jitter(~100)` = 1500 — xem A9 |
| `REDIS_CIRCUIT_OPEN_MS` | `5000` | Thời gian "nghỉ" sau khi connect thất bại: mọi lệnh trả lỗi ngay (0 RTT) thay vì trả giá connect lại. 5s = đủ ngắn để tự phục hồi sau blip, đủ dài để 1 invocation Lambda không trả giá 2 lần |

## A2 — Siết `createClient` trong `client.ts`

File: `packages/cache/src/redis/client.ts`, hàm `getRedisClient`.

```ts
const client = await createClient({
  url,
  socket: {
    connectTimeout: DEFAULT_REDIS_CONNECT_TIMEOUT_MS,
    // Giới hạn retry để connect() REJECT thay vì treo vô hạn (default của
    // node-redis retry mãi — xem mục "Bằng chứng" của plan này).
    reconnectStrategy: (retries) =>
      retries >= DEFAULT_REDIS_CONNECT_MAX_RETRIES ? false : 50,
  },
})
  .on("error", (err) => logError("RedisClient", err, { redisEnvKey: envKey }))
  .connect();
```

⚠️ **KHÔNG đặt `reconnectStrategy: false`** — đó là cái bẫy. `socket.js:330` gọi
`#shouldReconnect(0, err)` khi socket đứt **sau khi đã ready**; `false` tại `retries = 0` làm client
**không bao giờ tự reconnect** sau một blip mạng bình thường. Dạng `(retries) => retries >= N ? false : 50`
trả số ở `retries = 0` → cho phép reconnect, nhưng vẫn dừng sau `N` lần. Ghi chính xác lý do này vào
JSDoc, kèm tham chiếu `socket.js:313-334`, vì nó phản trực giác và người sau rất dễ "đơn giản hoá" thành `false`.

## A3 — Circuit + drop client đã chết

### A3.1. Circuit là 1 `Map<envKey, openUntilMs>` inline trong `client.ts`

**KHÔNG tạo file/class riêng.** Toàn bộ circuit = 1 field trong `RedisProcessState`
(`circuitOpenUntilMs: Map<string, number>`) + 3 chỗ dùng, tổng ~6 dòng:

```ts
// mở circuit (nhánh catch của connectClient)
state.circuitOpenUntilMs.set(envKey, Date.now() + REDIS_CIRCUIT_OPEN_MS);

// đóng circuit (connect thành công)
state.circuitOpenUntilMs.delete(envKey);

// kiểm tra (getRedisClient)
const openUntilMs = state.circuitOpenUntilMs.get(envKey);
if (openUntilMs !== undefined && Date.now() < openUntilMs) {
  throw new Error(`Redis circuit open for env ${envKey}`);
}
```

**Lý do KHÔNG dùng class + `CircuitState` enum** (bản plan đầu đề xuất, đã bác bỏ ở
review đơn giản hoá 2026-09-21): một class 58 dòng + `const object as const` +
`stateAt/recordFailure/recordSuccess` + file test 48 dòng chỉ để biểu đạt đúng 1 phép
so sánh `now < openUntil`. `CircuitState` là union 2 giá trị **nội bộ, không bao giờ
lộ ra API/DTO/DB** — §5.3 `code-quality-standards.mdc` nhắm vào tập giá trị nghiệp vụ
đi qua nhiều tầng, không phải cờ boolean trá hình dùng 1 chỗ. Hành vi giữ nguyên 100%
(đã verify lại bằng probe: circuit throw ở 0ms sau failure đầu).

### A3.2. Thứ tự trong `getRedisClient`

1. Có client cached **và** `client.isOpen === true` → trả ngay (đường nóng).
2. Có client cached nhưng `client.isOpen === false` → client **đã chết hẳn**.
   `destroy()` (bọc try/catch) để dọn `pingTimer` + command queue, xoá khỏi Map, đi tiếp.
   - **Vì sao `isOpen` không phải `isReady`:** `isReady === false` còn có nghĩa "đang
     reconnect hợp lệ" — drop lúc đó là phá cơ chế tự phục hồi. `isOpen === false` chỉ xảy ra khi
     `#shouldReconnect` nhận `false` (`socket.js:142-154`), tức node-redis đã **bỏ hẳn**.
   - Trạng thái `isOpen && !isReady` (đang reconnect): **không** drop — để command vào offline queue
     và bị `commandOptions.timeout` cắt. Đây là hành vi đúng cho blip ngắn.
   - `destroy()` throw `ClientClosedError` ở bước socket cuối, **sau khi** đã clear
     `pingTimer` + flush queue (`client/index.js:1511-1519`) → try/catch là đúng, không
     phải "bỏ qua lỗi cho xong".
3. **Đã có connect đang chạy cho envKey này** (`state.connecting`) → **JOIN promise đó**.
   Không có `await` nào phía trên nên 2 lời gọi concurrent luôn thấy Map đúng thứ tự.
   - **Vì sao cần:** đã verify — không có bước này, `Promise.all([cache.get(a), cache.get(b)])`
     (pattern chống waterfall được khuyến nghị toàn repo) mở **2 connection**, cái bị đè
     khỏi Map không ai `destroy()` → leak vĩnh viễn. Xảy ra ở mọi cold start.
4. Circuit `open` tại `Date.now()` → **throw ngay**, không gọi `connect()`. Adapter fail-open bắt →
   cache miss ở ~0ms.
5. Thiếu env → throw (lỗi cấu hình).
6. `connect()` bọc trong `withDeadline(..., DEFAULT_REDIS_CONNECT_DEADLINE_MS)` (A4):
   - Thành công → `circuitOpenUntilMs.delete`, cache client, trả về.
   - Thất bại/hết deadline → `client.destroy()` (huỷ connect đang chạy — xem A4) +
     `circuitOpenUntilMs.set` + `logError` + throw.
   - Promise đăng ký vào `state.connecting` ngay trước khi await, xoá trong `.finally()`.


Cả 3 Map (`clients`, `connecting`, `circuitOpenUntilMs`) gom vào **1 interface
`RedisProcessState`** (khai ở `redis/types.ts` để `global.ts` import không tạo vòng) →
chỉ cần **1** biến `globalThis.__nextJsRedisState` + **1** hàm `getState()`, thay vì 3
biến global + 3 hàm `getXxxCache()` song song. Cơ chế môi trường giữ nguyên: scope module
cho prod/worker, `globalThis` cho Next.js dev (HMR không reset state).

## A4 — `withDeadline` — backstop cho gap ĐÃ ĐO ĐƯỢC

File mới: `packages/cache/src/redis/with-deadline.ts`.

```ts
export async function withDeadline<T>(task: Promise<T>, deadlineMs: number, label: string): Promise<T>;
```

**Gap nó phủ — đã verify bằng probe TCP black-hole thật (2026-09-21):** `connectTimeout`
của node-redis được gắn bằng `socket.setTimeout` rồi **gỡ NGAY khi TCP connect xong**
(`socket.js:280-292`), TRƯỚC khi RESP handshake (HELLO/AUTH) chạy. Nếu Redis process
treo/OOM nhưng kernel vẫn accept TCP (backlog), handshake chờ reply vô thời hạn —
`commandOptions.timeout` cũng không phủ (handshake không qua command queue). Đo: sau
`connectTimeout=1000ms` × 2 lần thử vẫn **treo ở 4000ms không settle**.

**Đã cân nhắc và BÁC BỎ `socketTimeout` làm phương án thay thế** (review 2026-09-21):
nó *có* cắt được handshake hang (verify: reject `SocketTimeoutError`), nhưng
`socketTimeout` được cài bằng `socket.setTimeout` = **idle timeout** — connection
không có traffic quá ngưỡng bị giết rồi reconnect ngầm (verify: `SocketTimeoutError`
event bắn sau 800ms idle). Với Vercel/Lambda warm container giữ connection idle giữa
các request, đó là connection churn liên tục → không dùng được.

- **Bắt buộc `clearTimeout`** trong `finally` — timer rò sẽ giữ event loop Lambda sống thêm, tốn tiền
  và làm test treo. Unit test B1 kiểm tra đúng điều này.
- Reject bằng `Error` nội bộ có `label` để `logError` đọc được. **Không** throw `AppException` ở đây —
  `@megawin/cache` là hạ tầng, không biết gì về HTTP; việc dịch sang lỗi người dùng là của tầng trên
  (`error-handling-conventions.mdc`).

## A5 — Phủ `commandOptions` cho MỌI method của `RedisRepository`

File: `packages/cache/src/redis/repository.ts`.

Thêm tham số cuối `commandOptions?: RedisCommandOptions` cho **21 method** hiện chưa có, theo đúng
khuôn 5 method đã có (`get`, `set`, …):

- `exists`, `expire`, `pExpire`, `ttl`
- `incrBy`
- `hGet`, `hmGet`, `hIncrBy`
- `sAdd`, `sIsMember`
- `zAdd`, `zScore`, `zIncrBy`, `zRange`, `zRangeWithScores`, `zRangeByScore`, `zRemRangeByScore`, `zRem`, `zCard`, `zRank`
- `multi` — options phải áp **trước** khi mở transaction: `(await this.getClient(commandOptions)).multi()`
- `deleteByPrefix` — nhận optional nhưng **mặc định không truyền** (thao tác admin, giữ default 5s).
  JSDoc hiện có đã ghi rõ lý do; **giữ nguyên câu đó**, chỉ thêm tham số (`code-quality-standards.mdc` §4).

Ràng buộc:

- Tham số optional đặt **cuối** → không breaking bất kỳ caller nào.
- **Không** đổi `RedisRepository` sang fail-open. Nó phải giữ fail-fast (JSDoc `repository.ts:7-10`).
- Không thêm `any`. Reply giữ đúng type hiện tại.

## A6 — Sửa JSDoc đang nói SAI

Comment sai còn tệ hơn không có comment (`code-quality-standards.mdc` §4). Ba chỗ **phải** sửa:

| File | Nội dung hiện tại | Phải thành |
|---|---|---|
| `redis/client.ts:5-8` | *"FAIL-FAST: throw khi thiếu env hoặc **connect lỗi**"* | Ghi đúng hành vi mới: fail-fast nhờ `connectTimeout` + `reconnectStrategy` giới hạn (A2) + circuit breaker (A3); nêu rõ **trước** plan này nó treo vô hạn, để không ai revert |
| `stores/redis-store.ts:47-58` | Mô tả timeout 300ms như thể phủ toàn bộ | Nói rõ 300ms chỉ phủ **command**; pha connect do `DEFAULT_REDIS_CONNECT_*` + circuit breaker phủ |
| `redis/repository.ts:7-10` | Fail-fast (đúng) | Bổ sung: `getClient()` có thể throw ngay do circuit breaker đang mở — caller fail-open phải coi đó là lỗi bình thường, không log ở mức error |

---

# PHẦN B — TEST (viết SAU khi Phần A xong, tách biệt hoàn toàn)

> **Nguyên tắc tách biệt:** không sửa file nào trong `src/` ở Phần B. Test **đỏ** nghĩa là Phần A
> sai, không phải test sai. Mọi lần phải quay lại sửa `src/` đều ghi lại thành dòng "A-fix: <lý do>"
> để biết chỗ nào thiết kế chưa đúng ngay từ đầu.

## B0 — Chuẩn bị hạ tầng test

### B0.1. Pin image Redis khớp production

File: `tooling/vitest-config/src/testcontainers/redis-container.ts`

```ts
// Pin 8.6 = ĐÚNG version production. Tag "redis:8" là FLOATING — ngày 2026-09-21 nó
// resolve ra 8.10.1, lệch 2 minor so với prod. Nâng prod thì sửa đúng dòng này.
containerPromise = new RedisContainer("redis:8.6").withReuse().start();
```

Sau khi sửa, `pnpm --filter @megawin/vitest-config build` (package này build ra `dist/`, consumer
import từ `dist` — không build thì test vẫn dùng image cũ).

### B0.2. Xác nhận container đúng version — làm TRƯỚC khi viết test khác

```bash
docker ps --filter ancestor=redis:8.6 --format '{{.Image}}'
docker exec <container> redis-cli INFO server | grep redis_version
```

Kỳ vọng: `redis_version:8.6.x`. **Nếu không phải, dừng lại** — mọi kết luận test sau đó vô nghĩa.

⚠️ Docker daemon phải đang chạy. Lúc lập plan này (2026-09-21) daemon **không** chạy
(`Cannot connect to the Docker daemon`) → toàn bộ Phần B chưa chạy được. Kiểm tra `docker info` trước.

### B0.3. Xác nhận Redis 8.6 KHÔNG có lệnh rate limit native

Một lệnh, chốt lại giả định nền của `p0-01` (dùng Lua GCRA là đúng, không phải lựa chọn tạm):

```bash
docker exec <container> redis-cli COMMAND INFO GCRA INCREX CL.THROTTLE
```

Kỳ vọng: **cả 3 đều nil**. Ghi kết quả vào phần ghi chú thực thi của plan.

## B1 — Unit test (KHÔNG cần Redis, KHÔNG cần Docker)

Thư mục: `packages/cache/test/unit/`. Chạy: `pnpm --filter @megawin/cache test:unit`

### ~~`circuit-breaker.test.ts`~~ — ĐÃ BỎ (review đơn giản hoá 2026-09-21)

Circuit không còn là class riêng mà là `Map<envKey, openUntilMs>` inline (A3.1) → không
có unit nào để test riêng. Hành vi circuit được cover ở tầng **quan sát được từ bên
ngoài** trong `redis-fail-open.test.ts` (B2): lời gọi thứ 2 khi Redis down phải nhanh
hơn rõ rệt lần đầu. Đó là contract thật mà caller phụ thuộc; `stateAt(1000) === Open`
chỉ là chi tiết nội bộ.

### `with-deadline.test.ts`

| # | Test | Cách xác nhận PASS |
|---|---|---|
| 1 | Task xong trước deadline → trả đúng value | `resolves.toBe(value)` |
| 2 | Task chậm hơn deadline → reject, `label` có trong message | `rejects.toThrow(/label/)` |
| 3 | Task reject trước deadline → giữ nguyên lỗi gốc | Không bị deadline "che" lỗi thật |
| 4 | **Timer được clear** khi task resolve sớm | `vi.useFakeTimers()` + `vi.getTimerCount() === 0` sau khi await. Đây là test chống rò event loop — dễ bỏ sót nhất |

## B2 — Integration test (Redis thật qua Testcontainers)

Thư mục: `packages/cache/test/integration/`. Chạy: `pnpm --filter @megawin/cache test:integration`

`beforeEach` **bắt buộc** `flushDb()` (`test-data-safety.mdc`; xem comment `packages/cache/vitest.config.ts`).

### `redis-fail-open.test.ts` — file quan trọng nhất của plan

Toàn bộ dùng `redisEnvKey` **trỏ env riêng** (VD `REDIS_URI_BROKEN` = `redis://127.0.0.1:6399`) — **không**
sửa `REDIS_URI` do `global-setup-redis` set, và **tuyệt đối không** tạo/sửa file `.env*`
(`no-env-file-modification.mdc`). Set qua `process.env[...]` trong test.

| # | Test | Cách xác nhận PASS | Vì sao test này tồn tại |
|---|---|---|---|
| 11 | `RedisCacheStore({redisEnvKey: broken}).get(k)` → `undefined` | `toBeUndefined()` **và** không throw | Chính là bug plan này vá |
| 12 | Cùng lời gọi đó hoàn thành **< `DEFAULT_REDIS_CONNECT_DEADLINE_MS`** | Đo `Date.now()` trước/sau, assert `<` hằng thật | Trước khi sửa: treo 12s+ (đã đo). **Không** assert số ma |
| 13 | `set()` / `delete()` với Redis chết → resolve, không throw | `resolves.toBeUndefined()` | 3 method hot path phải fail-open như nhau |
| 14 | Lời gọi **thứ hai** nhanh hơn lời gọi đầu rõ rệt | So 2 mốc thời gian, lần 2 **< 50ms** | Chứng minh circuit breaker chặn thật, không phải connect lại |
| 15 | `new RedisRepository(broken).get(k)` **throw** | `rejects.toThrow()` | Khoá contract: repo fail-**fast**, chỉ store fail-**open**. Ngăn người sau "sửa" repo thành nuốt lỗi |

### `redis-repository.test.ts` — bổ sung vào file đã có

| # | Test | Cách xác nhận PASS |
|---|---|---|
| 16 | Redis **sống**: `get`/`set`/`incrBy`/`zAdd`/`ttl`/`multi` vẫn đúng như trước | Test cũ trong file này **vẫn xanh**, không sửa expectation |
| 17 | Truyền `commandOptions` vào ≥3 method mới (VD `incrBy`, `zAdd`, `ttl`) → vẫn đúng kết quả | Chứng minh A5 không làm hỏng đường thành công |
| 18 | `multi()` với `commandOptions` → `exec()` trả đúng | Đường transaction là chỗ A5 dễ sai nhất (options phải áp trước `.multi()`) |

## B3 — Không regress

| # | Lệnh | Kỳ vọng |
|---|---|---|
| 19 | `pnpm --filter @megawin/cache test` | Xanh **toàn bộ**, kể cả 6 file test đã có trước plan |
| 20 | `pnpm --filter @megawin/cache check-types` | Xanh |
| 21 | `pnpm check-types` | Không phát sinh lỗi mới ở package khác (A5 thêm param optional cuối → không breaking; lệnh này chứng minh điều đó thay vì tin lời) |

## B4 — Xác nhận thủ công (không tự động hoá được)

Ghi lại kết quả vào phần ghi chú thực thi:

1. **Đo trước/sau:** với Redis chết, gọi `store.get()` — ghi con số cụ thể của cả hai lần (kỳ vọng:
   từ ~12000ms+ xuống < 2500ms). Đây là bằng chứng bug đã được vá, không phải "test xanh nên chắc ổn".
2. **Blip mạng không phá client:** Redis sống → `get()` OK → `docker stop` → `get()` (fail-open) →
   `docker start` → `get()` **phải OK lại** mà không restart process. Đây là test cho cái bẫy ở A2
   (`reconnectStrategy: false` sẽ làm bước cuối FAIL).

## Definition of done

**Phần A (code):** — ✅ xong 2026-09-21

- [x] 4 hằng ở A1 có JSDoc ghi **công thức** + lý do con số; `DEFAULT_REDIS_CONNECT_DEADLINE_MS` tính từ 2 hằng kia.
- [x] `createClient` truyền `socket.connectTimeout` + `reconnectStrategy` dạng `(retries) => retries >= N ? false : 50`.
- [x] JSDoc giải thích **vì sao không dùng `reconnectStrategy: false`** (tham chiếu `socket.js:313-334`).
- [x] Circuit là `Map<envKey, openUntilMs>` inline (~6 dòng), **không** class/file/enum riêng.
- [x] `state.connecting` dedupe lời gọi concurrent → 1 connection duy nhất per env key.
- [x] Client `isOpen === false` bị drop khỏi Map (không drop khi `isOpen && !isReady`).
- [x] `withDeadline` có `clearTimeout` trong `finally`; JSDoc ghi gap **đã đo** nó phủ.
- [x] Nhánh catch của `connectClient` gọi `client.destroy()` — huỷ connect đang chạy, không để orphan socket.
- [x] **Tất cả 21 method** `RedisRepository` nhận `commandOptions` optional ở cuối.
- [x] 3 JSDoc ở A6 đã sửa cho khớp hành vi mới.
- [x] `RedisRepository` **vẫn fail-fast** — không thêm try/catch nuốt lỗi.
- [x] `oxlint packages/cache` không error; `prettier --write packages/cache` đã chạy.

**Phần B (test):** — ✅ xong 2026-09-21 (chiều)

- [x] `redis-container.ts` pin `redis:8.6`; `@megawin/vitest-config` đã build lại.
- [x] B0.2 / B0.3: assert trong `redis-fail-open.test.ts` — `redis_version` khớp `^8\.6\.` +
  `COMMAND INFO GCRA INCREX CL.THROTTLE` = `[null,null,null]`.
- [x] 4 unit test `with-deadline` (B1) xanh, gồm `DeadlineExceededError` + clear timer.
- [x] 5 test fail-open connect (#11–#15) ở `test/integration/redis-fail-open.test.ts` + `flushDb`.
- [x] A7 command-deadline: spy `getJson` treo → miss ~`commandTimeoutMs`; lần 2 vẫn ~deadline
  (không mở circuit).
- [x] Repository #16–#18 (commandOptions + multi) xanh.
- [x] B3: `pnpm --filter @megawin/cache test` → **73 passed**; `tsc --noEmit` `@megawin/cache` xanh.
  `pnpm check-types` toàn repo: agent sandbox chặn — user chạy tay nếu cần xác nhận A5 không breaking.
- [x] B4 blip `docker stop`/`start` Redis: **PASS** 2026-09-21 (probe 1 process, xem ghi chú).
- [x] A-fix: không có (không sửa `src/` trong Phần B).

## Ghi chú thực thi

### Phần A — 2026-09-21

- Probe fail-fast (cùng options với `client.ts` mới, port đóng): **reject sau 66ms** (trước: treo
  12s+ không settle).
- Circuit: `Map` inline `circuitOpenUntilMs` (không còn class `RedisCircuitBreaker`).
- `check-types` `@megawin/cache` xanh; `oxlint` không error mới (chỉ warning sẵn có ở `keys.ts`).
- Pin image `redis:8.6` + build `@megawin/vitest-config` xong.

### Phần B — 2026-09-21 (chiều, sau khi user bật Redis + sửa client/store)

- Đọc lại code mới: `runCommand` (tên cũ `runHotPath`) gọi `getClient()` **trước** `withDeadline`;
  command deadline **không** huỷ connection / không mở circuit; `DeadlineExceededError` phân mức log.
- Xoá lệch cũ: fail-open chuyển về **integration** (đúng plan); bỏ `circuit-breaker.test.ts`
  (class đã xoá); xoá `tmp-latency.test.ts` (TEMP, làm `afterAll` treo).
- `pnpm --filter @megawin/cache test` → **8 files / 73 tests passed**.
- **A-fix:** không có.

### A7 — Command-phase deadline (2026-09-21, sau review rủi ro network)

Xuất phát từ câu hỏi "AWS network outbound lỗi / không liên mạch thì sao". Đã tìm ra lỗ hổng
**nghiêm trọng hơn** bug connect-hang gốc, vì nó xảy ra **sau khi** đã connect thành công.

**Bug:** command đã ghi ra socket mà server không trả reply (network stall — SG/NAT drop im lặng,
Redis Cloud failover blackhole, route flap) **treo vĩnh viễn**. `commandOptions.timeout` KHÔNG cắt
được: node-redis tháo timeout listener ngay khi command rời `#toWrite` sang `#waitingForReply`
(`@redis/client` `commands-queue.js` quanh dòng 423–430) → nó chỉ bảo vệ pha CHƯA gửi.

Đo (TCP proxy freeze, không FIN/RST): `timeout: 300` → treo **>10s**; không truyền gì → treo
**>50s** dù source khai `DEFAULT_COMMAND_TIMEOUT = 5000`. Fail-open của `RedisCacheStore` dựa hoàn
toàn vào `timeout: 300` → **không hoạt động** đúng kịch bản nguy hiểm nhất. Lambda treo tới hết
timeout → API Gateway 504.

**Benchmark 20k GET (2 lần chạy, nhất quán) — phương án cũ là phương án ĐẮT NHẤT:**

| Phương án | CPU/op | Cắt được stall? |
|---|---|---|
| `commandOptions.timeout: 300` (cũ) | 25.7µs | ❌ |
| Không timeout (baseline) | 18.8–20.3µs | ❌ |
| **`withDeadline` race (đã chọn)** | **20.9µs** | ✅ |
| Watchdog 1 timer/cụm | 20.1µs | ✅ |

`AbortSignal.timeout` + add/removeEventListener mỗi command đắt hơn `setTimeout` trần → đổi sang
`withDeadline` **giảm 19% CPU** và bịt được lỗ. Không phải trade-off. Watchdog rẻ hơn 0.8µs nhưng
thêm ~15 dòng state + ngữ nghĩa deadline lỏng → **bỏ**, không xứng độ phức tạp.

**Đã làm:**

1. `with-deadline.ts`: thêm `DeadlineExceededError` (class riêng để caller phân biệt deadline với lỗi
   Redis thường — 2 loại cần log ở 2 mức khác nhau, xem điểm 4).
2. `redis-store.ts`: bỏ `hotPathOptions`, thêm `runCommand()` bọc `withDeadline` quanh **command**.
   Vượt deadline → **bỏ qua lệnh đó** (miss/no-op), **KHÔNG huỷ connection**. `deleteByPrefix`
   **không** bọc — **ĐÃ ĐẢO ở A9**: nay có trần rộng `DEFAULT_REDIS_ADMIN_TIMEOUT_MS` = 15s, và
   **ĐI CHUNG `runCommand`** qua tham số `deadlineMs` (A10) thay vì gọi `withDeadline` trực tiếp.
3. `REDIS_CIRCUIT_OPEN_MS` giữ **5000ms** (quyết định của user, xác nhận lại ở A9 — không lũy tiến).
   Circuit giờ chỉ do pha **connect** mở — pha command không bao giờ mở circuit nữa.
4. Log phân mức để alert không nhiễu:
   - **Pha command** vượt deadline → `logError` kèm `action` chỉ đúng hằng cần tăng
     (`DEFAULT_REDIS_COMMAND_TIMEOUT_MS`) + cách đọc tần suất log (lác đác = spike, bỏ qua; liên tục =
     trần quá thấp). Lỗi Redis khác → chỉ `logWarn` (`logFailOpen` trong `redis-store.ts`).
   - **Pha connect** vượt deadline → `logError` kèm `connectTimeoutMs` / `connectDeadlineMs` /
     `circuitOpenMs` + `action` nêu rõ **2 nhánh trái ngược**: Redis vẫn healthy = trần đặt quá thấp,
     phải đo p99 rồi tăng 2 hằng; Redis thật down = hành vi đúng, không sửa gì. Lỗi connect thường
     (ECONNREFUSED) → log gọn, không `action`.
   - JSDoc 2 hằng connect trong `constants.ts` ghi thẳng "**số phỏng đoán, CHƯA đo trên prod**" + trỏ
     tới log này như cách duy nhất phát hiện trần sai.

**Quyết định: KHÔNG huỷ connection khi command vượt deadline (đảo lại thiết kế trước đó).**

Bản trước có `dropRedisClient()` + strike counter (huỷ sau 2 lần vượt liên tiếp). Đã **bỏ cả hai**
theo yêu cầu "không drop connection, vượt timeout thì bỏ qua cho đơn giản nhất". Lý do đứng vững:

| Nguyên nhân vượt deadline | Tần suất | Nếu HUỶ connection | Nếu chỉ BỎ QUA |
|---|---|---|---|
| Redis/mạng chỉ chậm (noisy neighbor, BGSAVE fork, value lớn, spike cross-AZ) | thường xuyên | **Tự gây sự cố lớn hơn**: mất cache trọn 5s dù Redis khoẻ | Miss 1 lệnh, lệnh sau dùng cache bình thường |
| Connection treo thật (network stall, SG/NAT drop im lặng) | hiếm & ngắn (Redis Cloud uptime rất cao) | Miss 0ms sau request đầu | Miss sau đúng 300ms mỗi lệnh |

Đổi 300ms/lệnh trong ca hiếm để không bao giờ phá cache trong ca thường. Điều **bất biến** ở cả hai
phương án: request **không bao giờ treo** — đó mới là mục tiêu của p0-00. Bỏ được `dropRedisClient`
khỏi `client.ts` + export, và strike counter khỏi `redis-store.ts`.

**⚠️ Regression đã bắt được trong lúc verify — ghi lại để không tái phạm:** bọc `withDeadline`
thẳng quanh `repo.getJson()` là SAI, vì các method repo tự gọi `getClient()` bên trong → deadline
300ms ép luôn pha **connect**. Cold start Redis Cloud TLS (~600ms, hằng cho phép 2500ms) bị cắt ở
300ms → mọi cold start fail-open âm thầm mà log chỉ báo "vượt deadline". Sửa: gọi
`await this.repo.getClient()` **trước và ngoài** `withDeadline`. Lời gọi `getClient()` thứ hai bên
trong `op()` chỉ là Map lookup — đo **0.296µs**, ~1% chi phí 1 command.

**Verify qua `RedisCacheStore` / `getRedisClient` thật (TCP proxy, không mock) — toàn bộ PASS:**

| Ca | Đo | Kỳ vọng |
|---|---|---|
| Redis khoẻ: set / get hit / get miss | 17ms / 1ms / 1ms | Không đội chi phí |
| **Spike latency 1 lần rồi hồi** | degrade **1 lần**; set #2 **1ms**, get #3 **HIT** | Connection giữ nguyên, cache dùng lại NGAY (ca bản cũ làm sai) |
| **Stall vĩnh viễn, get #1–#3** | **302 / 302 / 301ms**, đều miss | Cắt đúng deadline, không treo, không nhân lên |
| **Handshake chậm 700ms** | set **711ms**, get #2 **HIT**, **0 degrade** | Deadline command KHÔNG cắt pha connect |
| Connect blackhole (accept rồi im lặng) | throw **2511ms** + `logError` đủ 3 hằng + `action` | `withDeadline` bịt gap RESP handshake, log actionable |
| Lời gọi sau blackhole | throw **0ms**, `"circuit open"` | Circuit pha connect vẫn hoạt động |
| Redis down hẳn (ECONNREFUSED) | throw + log **gọn, không `action`** | Không báo động sai "tăng trần" khi Redis thật down |

`check-types` xanh · `oxlint packages/cache/src` không error mới · `pnpm --filter @megawin/cache test`
**70/70 passed**.

**Còn nợ (chưa làm trong lần này):**

- [x] Unit/integration test command-phase deadline (A7) — đã thêm vào
  `test/integration/redis-fail-open.test.ts` (spy `getJson` treo; không cần TCP proxy).
- [x] B4 blip mạng `docker stop`/`start` Redis — PASS 2026-09-21 (xem mục B4 bên dưới).
- Hằng connect hiện tại: `CONNECT_TIMEOUT=3000` / `CONNECT_DEADLINE=5000` / `COMMAND=500`
  (đã nới so với bản A9). Vẫn **chưa đo p99 prod** — nếu p99 > deadline thì cold start
  fail-open âm thầm; theo dõi `logError` ở `connectClient`.

### B4 — Xác nhận thủ công (2026-09-21 tối)

Probe 1 process Node (`tsx`), container riêng `redis:8.6` port 16400 — **không** restart process.

| Bước | Kết quả |
|---|---|
| Redis sống → `set`/`get` | HIT `{ v: 1 }` |
| `docker stop` → `get` | `undefined` trong **2ms** (socket closed → fail-open; không treo) |
| `docker start` + chờ circuit `REDIS_CIRCUIT_OPEN_MS` (5s) → `set`/`get` | HIT `{ v: 2 }` — **reconnect OK cùng process** (bẫy `reconnectStrategy: false` không xảy ra) |
| Redis chết (port 6399) lần 1 | `undefined` trong **71ms** (trước: treo 12s+) |
| Redis chết lần 2 | `undefined` trong **0ms** (circuit) |

**Verdict:** B4.1 + B4.2 **PASS**.


## A9 — Vòng siết thứ hai: cắt code thừa, hạ trần connect

Trigger: (a) đo trên harness black-hole thấy **50 request đồng thời đều tốn 2505–2513ms**; (b) rà lại
xem cái gì `node-redis` đã tự làm mà mình làm trùng.

**Đã làm:**

1. **`DEFAULT_REDIS_CONNECT_DEADLINE_MS`: 2500 → 1500.** Bỏ cách tính "nhân theo `MAX_RETRIES`"
   (1000 × 2 + backoff + jitter). Công thức mới: `CONNECT_TIMEOUT(1000) + RESP handshake(~400) +
   jitter(~100)`. Retry thành **best-effort trong budget**: fail nhanh vẫn kịp lần 2, fail chậm bị cắt
   ở 1500ms. Trả giá 2 lần handshake là vô nghĩa khi circuit đã cho thử lại sau 5s.

   Đo lại trên harness sau khi sửa:

   | Ca | Trước | Sau |
   |---|---|---|
   | Black-hole (accept rồi im lặng) | 2511ms | **1511ms**, `cause = DeadlineExceededError` |
   | 50 request đồng thời, black-hole | 2505–2513ms | **total 1501ms, min=max=1501ms** (1 connect chung) |
   | ECONNREFUSED (fail nhanh) | — | **71ms** — retry lần 2 vẫn kịp trong budget |
   | Redis thật khoẻ | — | **18ms**, `isReady = true` — không bị cắt oan |

2. `deleteByPrefix` **có trần** `DEFAULT_REDIS_ADMIN_TIMEOUT_MS = 15_000` (trước đó không có). Đảo
   quyết định ở điểm 2 của A7: fail-open chỉ bảo vệ khi lệnh **settle**; command đã gửi mà không có
   reply thì không cắt được → "không trần" = treo tới khi Lambda/Vercel giết request. Invalidate cache
   không được phép làm chết request đã ghi DB thành công.
3. Lỗi connect throw kèm **`cause`** (giữ `DeadlineExceededError`/lỗi socket gốc) + message đổi thành
   `Redis connect failed for env <key>` (có test).
4. **Bỏ `cached.destroy()`** ở nhánh `isOpen === false` trong `getRedisClient` — đã đọc source
   `@redis/client@6` xác nhận nó là **no-op**, cả 3 việc `destroy()` làm đều đã xong hoặc không áp dụng:
   `clearTimeout(#pingTimer)` (ta không set `pingInterval`); `#queue.flushAll()` (node-redis đã flush —
   `#shouldReconnect` set `#isOpen = false` **trước** khi emit `error`, nên listener `error` thấy
   `!isOpen` và gọi đúng `flushAll`); `#socket.destroy()` **throw `ClientClosedError`** nên mọi bước sau
   nó (`#unregisterFromMetrics`, `credentialsSubscription.dispose`) không bao giờ chạy. Xoá khỏi Map là
   đủ. Gỡ được cả khối `try/catch` bao quanh.

**Đã cân nhắc và BỎ (đừng thêm lại nếu không có log prod):**

| Đề xuất | Lý do bỏ |
|---|---|
| `REDIS_STALL_DEADLINE_STREAK` — N deadline liên tiếp → destroy client để tự chữa stall | **node-redis đã tự chữa**: keepalive bật MẶC ĐỊNH (`keepAlive: true`, `keepAliveInitialDelay = 30_000` — `@redis/client/.../socket.js` + `defaults.js`); proxy Redis Enterprise cũng keepalive `client_keepidle=180`/`keepintvl=30`/`keepcnt=6` → stall **có cận trên**, không "vĩnh viễn". Thêm nữa, ngưỡng đủ nhỏ để hữu ích (3 × 300ms = 900ms) cũng đủ nhỏ để spike THẬT kích hoạt → huỷ connection KHOẺ nhiều hơn là bắt được stall. Trong lúc stall app **không treo, không down** (miss sau đúng 300ms) nên không vi phạm yêu cầu nào |
| `REDIS_CIRCUIT_OPEN_STEPS_MS = [5s, 15s, 60s]` — circuit lũy tiến | Redis Cloud phục hồi nhanh (HA + proxy failover), nên sự cố dài — đúng ca mà bậc thang tối ưu — là ca hiếm; đổi lại phải thêm Map `connectFailures` reset đúng ở mọi nhánh, và làm thời gian mất cache sau blip xấu nhất dài **gấp 12 lần**. **Giữ `REDIS_CIRCUIT_OPEN_MS = 5000` phẳng** (quyết định của user) |
| `DEFAULT_REDIS_REPROBE_DEADLINE_MS` + PROBE mode (1 attempt sau khi đã fail) | Hạ `CONNECT_DEADLINE` xuống 1500 đã đạt gần hết lợi ích (2511ms → 1511ms) mà không cần 2 chế độ, không cần flag `handshakeDone` trong closure `reconnectStrategy` (thứ dễ hỏng nhất: cùng 1 strategy phục vụ 2 pha khác nhau của node-redis, sai một nước là client không bao giờ reconnect sau blip) |
| `REDIS_LOG_THROTTLE_MS` — throttle log fail-open | Log flood có thật (20 request song song → 20 dòng) nhưng chưa có bằng chứng prod là vấn đề, mà phải thêm state per-(envKey, op) + đếm suppressed. Chờ hoá đơn CloudWatch thật |

**Sau A9, state của `client.ts` còn đúng 3 Map** (`clients`, `connecting`, `circuitOpenUntilMs`) — mỗi
cái phủ 1 gap đã đo, không có gì trùng với `node-redis`.

### A10 — `withDeadline` ở pha command: có THẬT cần? + gộp `runHotPath`/`deleteByPrefix` (2026-09-21)

**Câu hỏi user:** "connection đang hoạt động thì command sẽ luôn thành công chứ?" → **KHÔNG.** Đã
chứng minh bằng đo, không chỉ đọc source.

**Bằng chứng 1 — source `@redis/client@6.1.0`** (`commands-queue.js`, vòng `#toWrite` → `#waitingForReply`):

```js
if (toSend.timeout) { RedisCommandsQueue.#removeTimeoutListener(toSend); toSend.timeout = undefined; }
this.#waitingForReply.push(toSend);
```

Listener của `commandOptions.timeout` bị **tháo ngay khi command rời queue ghi**. Sau mốc đó chỉ còn
socket `error` reject được command. Network stall im lặng (SG/NAT drop, failover blackhole) **không sinh
error** → command treo không giới hạn. `DEFAULT_COMMAND_TIMEOUT = 5000` trong thư viện cũng không cứu:
nó dùng chính cơ chế listener đã bị tháo đó.

**Bằng chứng 2 — đo thật qua proxy TCP tới Redis 8.6 thật.** Proxy pass-through, connect + command OK,
rồi **bịt luồng dữ liệu 2 chiều mà KHÔNG đóng socket** (không FIN/RST → giống network stall thật):

| Đường đi | `isOpen` / `isReady` | Kết quả |
|---|---|---|
| `client.get()` trần (không `withDeadline`) | `true` / `true` | **STILL-HANGING sau 5002ms** (cắt test ở 5s) |
| `store.get()` qua `runCommand` | `true` / `true` | **miss ở 305ms**, fail-open đúng |

Tức là: connection báo khoẻ, `isReady === true`, mà command vẫn không settle. `withDeadline` ở pha
command **không thừa** — nó là thứ duy nhất chặn ca này.

**Ca thường gặp hơn (không cần stall):** `isOpen === true && isReady === false` khi đang reconnect.
node-redis mặc định `disableOfflineQueue: false` → command **xếp hàng chờ** reconnect xong, không fail
nhanh. Không có trần thì mỗi cache call trong cửa sổ đó cộng nguyên thời gian reconnect vào request.

**Refactor (theo đề xuất user):** `runHotPath` → **`runCommand(label, op, deadlineMs?)`**, mặc định
`this.commandDeadlineMs`. `deleteByPrefix` nay gọi `runCommand(..., DEFAULT_REDIS_ADMIN_TIMEOUT_MS)`
thay vì tự gọi `getClient()` + `withDeadline` rời. Lý do gộp: khác biệt duy nhất giữa hot path và admin
là **con số**; phần cơ chế (gọi `getClient()` NGOÀI trần, bọc `withDeadline`, throw để caller fail-open)
giống hệt → để 2 chỗ thì mỗi lần sửa cơ chế phải sửa 2 lần, và `deleteByPrefix` là chỗ dễ quên nhất vì
không nằm trên hot path nên không ai test tay.

**Test chặn regression:** thêm `deleteByPrefix dùng trần admin, không bị cắt ở commandTimeoutMs`
(`commandTimeoutMs: 20` + op 200ms). Đã **mutation-check**: bỏ tham số `DEFAULT_REDIS_ADMIN_TIMEOUT_MS`
ở call site → test fail `expected 22 to be greater than or equal to 190`. Test bắt đúng thứ nó hứa.

**Kết quả:** `check-types` xanh, `oxlint` không error mới (chỉ 2 warning sẵn có ở `keys.ts`),
`pnpm --filter @megawin/cache test` → **8 files / 75 tests passed**; chạy lặp 4 lần file
`redis-fail-open.test.ts` (timing-sensitive) đều 10/10 → không flaky.

## Không làm trong plan này (chống scope creep)

- ❌ Thêm `eval`/`evalSha`/`scriptLoad` → `p0-01` Bước 1.
- ❌ Tạo `packages/guard` → `p0-01`.
- ❌ Thêm `CacheNamespace.Guard` → `p0-01` Bước 2.
- ❌ Đổi TTL/tuning cache hiện có.
- ❌ Sửa `apps/*/serverless.yml`, tạo/sửa `.env*` (`no-env-file-modification.mdc`).
- ❌ Đổi `RedisRepository` thành fail-open — nó **phải** giữ fail-fast; fail-open là việc của adapter.