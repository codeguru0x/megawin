# 01 — Hiện trạng & Phân tích Hot Data

> Khảo sát codebase megawin (2026-07-11): cache đang có gì, dữ liệu nào nóng, dữ liệu nào cache được.

## 1. Hiện trạng cache trong codebase

### 1.1. `@megawin/cache` — scaffold có sẵn nhưng **chưa có consumer nào**

- `packages/cache/src/redis/client.ts` — `getRedisClient(redisEnvKey)`: connect qua env URI (mặc định `REDIS_URI`), client cache theo Map module-level + `globalThis` cho Next.js dev HMR (pattern y hệt `@megawin/data`).
- `packages/cache/src/redis/repository.ts` — abstract `RedisRepository`: API khá đầy đủ (`cache`/`getCache` JSON + TTL, `get/set/delete/exists`, `incr`, `expire/pExpire` với mode NX/XX/GT/LT, `ttl`, hash `hget/hmget/hIncrBy`, set `sadd/sIsMember`).
- **Vấn đề packaging**: chưa có `exports` subpath, chưa có barrel `index.ts`, `main` trỏ tới `index.js` không tồn tại → muốn dùng phải chuẩn hoá theo convention các package khác trước.
- **Zero consumer**: grep toàn repo, không app/package nào import `@megawin/cache`. Chỉ được nhắc trong docs operator (kế hoạch tương lai).

### 1.2. Redis chưa được deploy cho bất kỳ Lambda nào

- Tất cả 11 `serverless.yml` (`api-player`, `api-tenant`, 9 workers): environment chỉ có `STAGE` + `MONGODB_URI` (env/SSM). **Không có `REDIS_URI`**, **không có VPC config** (Lambda hiện chạy ngoài VPC).
- `apps/backoffice/src/env.ts` **require** `REDIS_URI` trong schema Zod nhưng không có code nào đọc nó — env "đặt chỗ" gây friction khi setup local, đáng review.
- Không có Terraform/CDK/docker-compose nào define Redis.

### 1.3. Cache duy nhất đang chạy thật: LRU của `tenant-gateway`

```39:59:packages/tenant-gateway/src/gateway.ts
const DEFAULT_TIMEOUT = 30_000;

/**
 * Thời gian cache 1 TenantGatewayClient (ms).
 *
 * 10 phút: callbackBaseUrl + apiKey gần như không bao giờ thay đổi giữa các kỳ quay.
 * Settle 1 draw (200 entries × 4 batches) hoàn tất trong ~30s → 1 DB query / 10 phút / tenant.
 *
 * Trade-off: nếu admin rotate apiKey, client cũ vẫn dùng tối đa 10 phút.
 * Workaround: gọi `tenantGateway.invalidate(tenantId)` khi update config.
 */
const CACHE_TTL_MS = 10 * 60_000;
```

- Lib `lru-cache@11`, key = `tenantId`, TTL 10 phút, max 500, **negative-cache** (sentinel `NO_CONFIG`), **stale-on-error** (`allowStaleOnFetchRejection/Abort`), **concurrent dedup** qua `fetchMethod`.
- Đây là pattern chuẩn nên tái dùng cho toàn hệ thống.
- ⚠️ **Gap hiện hữu**: `invalidate()` được document nhưng **không nơi nào gọi** — `UpdateTenantUseCase` đổi `callbackBaseUrl` không invalidate → Lambda warm dùng URL cũ tối đa 10 phút.

### 1.4. Các điểm "chờ cache" đã được thiết kế sẵn trong code

Codebase đã chuẩn bị đúng chỗ cắm (chokepoint) — cache chỉ cần chèn tại internal use-case, caller không đổi:

- `packages/game-{game}-application/src/use-cases/tenant-config/get-tenant-config-internal.ts` — TODO trong code: "Thêm in-memory cache (TTL ~30-60s), cache key = tenantId, invalidate khi admin cập nhật".
- `packages/game-{game}-application/src/use-cases/game-config/get-global-config-internal.ts` — comment "Sau này có thể thêm in-memory cache / TTL tại đây".
- `packages/game-lotto535-application/src/use-cases/operations/get-top-combos.ts` — gợi ý cache result hoặc materialize vào draw doc.

### 1.5. Pattern hạ tầng hiện tại

Hệ thống dựa vào **Lambda container reuse + module-level singleton** (Mongo client cache, use-case singleton). Đây là dạng "L1 cache tự nhiên" — mọi thiết kế cache mới nên xây trên nền này thay vì chống lại nó.

---

## 2. Phân tích Hot Data — bảng ưu tiên

| # | Candidate | Độ nóng (read) | Tần suất đổi | Phù hợp cache | Đã có cache? |
|---|---|---|---|---|---|
| 1 | Tenant auth (lookup by apiKey) | ★★★★★ mỗi request api-tenant | Rất hiếm | **Rất cao** | ❌ |
| 2 | TenantGatewayClient (callbackBaseUrl+apiKey) | ★★★★★ mỗi debit/credit | Rất hiếm | Rất cao | ✅ LRU 10ph |
| 3 | Global GameConfig (per game) | ★★★★★ mỗi place-bet + settle | Hiếm (backoffice) | **Rất cao** | ❌ (có TODO) |
| 4 | TenantConfig (per game × tenant) | ★★★★★ mỗi place-bet | Hiếm (backoffice) | **Rất cao** | ❌ (có TODO) |
| 5 | Current draw (active draws) | ★★★★☆ polling + place-bet | Vài phút (keno 10ph, bingo18 6ph) | Cao — TTL 3–10s | ❌ |
| 6 | Draw results (settled) | ★★★☆☆ polling | Gần immutable (trừ resettle) | Rất cao — TTL dài/CDN | ❌ |
| 7 | Jackpot (active cycle) | ★★★☆☆ polling | Mỗi lần settle draw | Trung bình — TTL 10–30s | ❌ |
| 8 | Settle worker reads | ★★☆☆☆ | — | Đã tối ưu (SettleContext pass-down) | ✅ pattern |

## 3. Chi tiết từng candidate

### 3.1. Tenant auth — hot nhất, chưa cache

- **Flow**: mỗi HTTP request server-to-server → `withTenantAuth` middleware (`packages/auth/src/tenant-api-key-auth.ts`) → `getTenantByApiKey` → `tenants.findOne({apiKey})` Mongo (`packages/identity-application/src/infras/repos/tenant-repo.ts`).
- Đặc biệt nóng vì `get-entry-feed` được tenant **poll liên tục** theo cursor.
- **Doc nhỏ** (projection 4 fields: tenantId, displayName, status, apiKey), đổi cực hiếm (update-tenant, update-tenant-status).
- **Đề xuất**: cache in-memory keyed by `apiKey`, TTL 60s. Suspend tenant trễ tối đa 60s — chấp nhận được. Nếu tương lai cần "khoá tenant tức thời" → đó là lý do đầu tiên để thêm L2 Redis.
- **Invalidation**: `UpdateTenantUseCase`, `UpdateTenantStatusUseCase` (hiện không có hook nào — TTL ngắn là đủ).

### 3.2. Global GameConfig — đọc mỗi place-bet + settle

- **Reads**: `place-bet.ts` (unitPrice, maxDrawCount, prizes — **mỗi lần đặt cược**), `prepare-settle.ts` (1 lần/draw rồi pass qua `SettleContext`), `get-game-config-player.ts` (API polling), worker create-draws (lịch quay).
- **Write**: duy nhất `update-game-config.ts` từ backoffice — rất hiếm (đổi thể lệ).
- **Điểm an toàn quan trọng**: config được **snapshot vào entry lúc place-bet** → settle luôn nhất quán với config tại thời điểm mua, cache trễ 60s không gây sai lệch tài chính.
- **Đề xuất**: TTL 30–60s tại `get-global-config-internal.ts`. 1 doc/game — memory footprint không đáng kể.

### 3.3. TenantConfig — đọc mỗi place-bet

- **Reads**: `place-bet.ts` (check `isEnabled`, `commissionRate`), `get-game-config-player.ts`.
- **Write**: `update-tenant-config.ts` (backoffice, có version increment + audit).
- **Đề xuất**: TTL 30–60s tại `get-tenant-config-internal.ts`, key = `tenantId`. Disable game per tenant trễ TTL — chấp nhận được (khoá khẩn cấp nằm ở tenant status trong auth layer).

### 3.4. Current draw — micro-cache, TTL phải rất ngắn

- `get-current-draw-player.ts` được client SDK poll để hiển thị countdown → nhiều player poll cùng lúc = **thundering herd** trên cùng 1 query.
- Bingo18 kỳ mỗi 6 phút (~160 kỳ/ngày), Keno mỗi ~10 phút (~95 kỳ/ngày) — status đổi liên tục qua workers.
- **Đề xuất**: micro-cache **TTL 3–10s** — chỉ để gộp polling storm thành 1 query. Cân nhắc làm ở **API Gateway cache** thay vì app-level (share giữa mọi Lambda instance, không đổi code).
- ⛔ **`getDrawsByIds` trong place-bet KHÔNG cache** — validation `salesOpen` + `closeAt` phải chính xác tuyệt đối; sai 1 giây có thể nhận bet sau khi đóng bán.

### 3.5. Draw results (settled) — cache mạnh nhất được

- GẦN immutable — ngoại lệ duy nhất: **resettle** (`republishResultAfterSettled` cho phép `settled → published` → sửa kết quả → settle lại). Nghiệp vụ hiếm, có audit.
- **Đề xuất**: `get-draw-result/{drawId}` TTL 5–60 phút hoặc CDN cache; `list-draw-results` trang đầu TTL 30–60s (đổi mỗi khi có draw mới settle), trang sâu (cursor cũ) bất biến — cache dài.
- **Invalidation**: duy nhất tại workflow resettle — nếu CDN thì purge theo `drawId`.

### 3.6. Jackpot — TTL ngắn, không cần invalidation

- 3 games có jackpot (lotto535, mega645, power655). Đổi **mỗi lần settle draw** (lotto535 = 2 lần/ngày, power655 = 3 lần/tuần). Giữa 2 lần settle hoàn toàn tĩnh.
- **Điểm thiết kế tốt sẵn có**: settle flow đọc jackpot qua PrepareSettle snapshot riêng, KHÔNG dùng use-case player → cache player-facing không ảnh hưởng tính đúng của settle.
- **Đề xuất**: TTL 10–30s (jackpot là hiển thị marketing, không cần realtime tuyệt đối). TTL hết hạn nhanh hơn chu kỳ settle rất nhiều → không cần invalidation chủ động.

### 3.7. Settle worker — không cần cache thêm

Pattern "đọc config 1 lần ở PrepareSettle, pass qua `SettleContext`" đã loại bỏ repeated reads trong vòng lặp settle (batch 500 entries). Điểm nóng còn lại (`tenantGateway.getClient`) đã có LRU cache.

## 4. Danh sách KHÔNG cache (hard rules)

1. `getDrawsByIds` trong place-bet validation.
2. WAL / TxIntent / recovery data.
3. Balance callbacks (debit/credit) — mỗi call là giao dịch.
4. Entries / tickets — dữ liệu giao dịch, đọc theo cursor.
5. Bất kỳ read nào là input trực tiếp cho quyết định ghi tài chính, trừ khi giá trị đã được snapshot vào document ghi (như GameConfig → entry).
