# 04 — Áp Dụng Vào Use Case Cụ Thể & Roadmap

> Mapping cache vào từng package/use-case đang có + lộ trình triển khai 3 phase.

## 1. Bảng mapping tổng — cache gì, ở đâu, TTL bao nhiêu

| # | Dữ liệu | Chỗ cắm (file cụ thể) | Store | TTL | Key | Invalidate tại |
|---|---|---|---|---|---|---|
| 1 | Tenant by apiKey | `packages/auth/src/tenant/tenant-auth.ts` (hoặc `identity-application` use-case internal mới) | L1 | 60s | `identity:tenant-by-apikey:v1:{hash}` | `update-tenant.ts`, `update-tenant-status.ts` |
| 2 | Global GameConfig ×7 | `packages/game-{game}-application/src/use-cases/game-config/get-global-config-internal.ts` (TODO sẵn) | L1 | 60s | `{game}:global-config:v1` | `update-game-config.ts` (per game) |
| 3 | TenantConfig ×7 | `packages/game-{game}-application/src/use-cases/tenant-config/get-tenant-config-internal.ts` (TODO sẵn) | L1 | 60s | `{game}:tenant-config:v1:{tenantId}` | `update-tenant-config.ts` (per game) |
| 4 | Current draw (player) | `use-cases/player/get-current-draw-player.ts` ×7 | L1 hoặc API GW | 3–5s | `{game}:current-draw:v1` | Không — TTL only |
| 5 | Jackpot (player) | `use-cases/player/get-jackpot-player.ts` (lotto535/mega645/power655) | L1 hoặc API GW | 15s | `{game}:jackpot:v1` | Không — TTL only |
| 6 | Draw result (settled) | `use-cases/player/get-draw-result-player.ts` ×7 | L1 (→L2/CDN) | 10ph | `{game}:draw-result:v1:{drawId}` | Resettle workflow (`republishResultAfterSettled`) |
| 7 | List draw results (trang đầu) | `use-cases/player/list-draw-results-player.ts` ×7 | L1 | 30s | `{game}:draw-results:v1:{cursorHash}` | Không — TTL only |
| 8 | TenantGatewayClient | `packages/tenant-gateway/src/gateway.ts` | ✅ đã có | 10ph | — | ⚠️ nối dây `invalidate()` (xem §3) |
| 9 | Top combos (lotto535) | `use-cases/operations/get-top-combos.ts` (TODO sẵn) | L1 | 5ph | `lotto535:top-combos:v1` | Không — TTL only |

### Những nơi tuyệt đối KHÔNG cache

- `place-bet.ts` → `drawRepo.getDrawsByIds()` — validate `salesOpen`/`closeAt` realtime.
- `debit-player-service.ts` balance callbacks — giao dịch.
- Settle flow reads (`getScheduledEntries`, `getWinningEntriesForDispatch`) — bản chất công việc, cursor-based.
- WAL / TxIntent / recovery.

## 2. Chi tiết per-package

### 2.1. `packages/identity-application` + `packages/auth` — Tenant auth (quick win #1)

Hot path nóng nhất toàn hệ thống: mỗi request api-tenant = 1 lần `tenants.findOne({apiKey})`, và `get-entry-feed` bị tenant poll liên tục.

- Tạo internal use-case `get-tenant-by-api-key-internal.ts` trong `identity-application` (theo pattern `*-internal` của game packages) — wrap `tenantRepo.findByApiKey` bằng `createCachedFetcher`, TTL 60s, negative caching 10s (apiKey sai không đập DB liên tục).
- `packages/auth` middleware chỉ đổi sang gọi internal use-case — API không đổi.
- **Trade-off chấp nhận**: suspend tenant có hiệu lực trễ ≤ 60s trên các container warm. Nếu nghiệp vụ yêu cầu khoá tức thời → đó là trigger cho Phase 3 (L2 delete key).
- Invalidate same-process trong `update-tenant.ts` / `update-tenant-status.ts` (có tác dụng ngay trong backoffice).

### 2.2. `packages/game-*-application` ×7 — GameConfig + TenantConfig (quick win #2, #3)

Chỗ cắm đã được thiết kế sẵn — TODO nằm trong code:

- `get-global-config-internal.ts`: wrap `gameConfigRepo.getGlobalConfig()`, TTL 60s. Hưởng lợi ngay: **mỗi place-bet bớt 1 query**, `get-game-config-player` (polling) bớt 1 query.
- `get-tenant-config-internal.ts`: wrap `tenantConfigRepo.findByTenantId()`, TTL 60s, key theo `tenantId`.
- **An toàn tài chính đã được đảm bảo sẵn**: config snapshot vào entry lúc place-bet; settle đọc config qua `PrepareSettle` → `SettleContext` (1 lần/draw, không qua cache path) → cache trễ 60s không gây sai lệch settle.
- Invalidate same-process trong `update-game-config.ts` / `update-tenant-config.ts` — backoffice thấy thay đổi ngay, Lambda chờ TTL.
- Vì pattern lặp ×7 games: implement keno + bingo18 trước (TPS cao nhất — bingo18 kỳ 6 phút), roll out 5 games còn lại theo cùng khuôn.

### 2.3. `apps/api-player` — polling endpoints (micro-cache)

- `get-current-draw` ×7: micro-cache TTL 3–5s trong `get-current-draw-player.ts` — mục đích duy nhất là gộp polling storm thành 1 query Mongo/container/3s. Countdown client không bị ảnh hưởng đáng kể (client tự đếm giữa các lần poll).
- `get-jackpot` ×3: TTL 15s — jackpot đổi theo chu kỳ settle (2 lần/ngày với lotto535), 15s là dư an toàn.
- `get-draw-result/{drawId}`: TTL 10 phút — settled result gần immutable. Chỉ cần nhớ invalidate khi resettle (hoặc chấp nhận trễ 10 phút cho nghiệp vụ cực hiếm này — nên document trong runbook resettle).
- **Phương án thay thế tốt hơn về infra**: bật API Gateway cache cho các endpoint này (chặn từ trước Lambda, tiết kiệm cả invocation cost). Cần đánh giá cache key theo tenant/token — nếu response giống nhau cho mọi player cùng tenant thì vary theo tenant header là đủ.

### 2.4. `packages/tenant-gateway` — sửa gap invalidation

- Gọi `tenantGateway.invalidate(tenantId)` từ `UpdateTenantUseCase` (khi backoffice và gateway cùng process) — hiện JSDoc hứa nhưng không nơi nào gọi.
- Cân nhắc hạ `CACHE_TTL_MS` 10ph → 5ph nếu lo ngại rotate apiKey; hoặc giữ nguyên + document rõ staleness bound cross-process là 10 phút.
- Về dài hạn có thể refactor gateway dùng `@megawin/cache` `MemoryCacheStore` cho đồng nhất, nhưng **không ưu tiên** — code hiện tại đúng và đã kiểm chứng.

### 2.5. `apps/backoffice` — dọn env + cơ hội riêng

- `env.ts` đang **require** `REDIS_URI` mà không dùng → chuyển thành optional (`z.string().optional()`) cho tới khi Phase 3, giảm friction setup local.
- Backoffice là Next.js long-running: các trang dashboard đọc config/stats lặp có thể dùng `MemoryCacheStore` (max bound chặt) hoặc `React.cache()`/`unstable_cache` của Next.js cho per-request dedup — nằm ngoài scope package cache nhưng cùng nguyên tắc.

### 2.6. Tương lai — Operator platform (tham chiếu)

Theo `docs/operator/operator-platform-design.md`, operator sẽ cần: session store, rate-limit, idempotency keys, ví/leaderboard — đây là các nhu cầu **bắt buộc Redis thật** (shared state, không phải cache). Khi đó:

- Operator đã có VPC (Postgres + ECS `operator-wallet-svc`) → **ElastiCache Serverless for Valkey** là lựa chọn tự nhiên.
- `@megawin/cache` interface-first cho phép core game packages tái dùng cùng cluster (nâng L1 → TieredCache chỉ bằng env `REDIS_URI`).

## 3. Roadmap 3 Phase

### Phase 1 — L1 in-memory (zero infra, ~1 sprint) ⭐

1. Chuẩn hoá packaging `@megawin/cache`: exports subpaths, barrel, thêm `lru-cache` dep.
2. Implement `types.ts`, `MemoryCacheStore`, `NoopCacheStore`, `createCachedFetcher` (single-flight + negative caching), `cacheKey()` + tests.
3. Cắm 3 quick wins: tenant-by-apiKey (60s) → GameConfig keno/bingo18 (60s) → TenantConfig keno/bingo18 (60s) → roll out 5 games còn lại.
4. Nối dây invalidation same-process tại các update use-case + `tenantGateway.invalidate()`.
5. Đổi `REDIS_URI` trong backoffice env thành optional.

**Kỳ vọng**: giảm 60–80% reads Mongo cho collections config/tenants trên hot path; place-bet bớt 2 queries (global config + tenant config); đo bằng Atlas metrics trước/sau.

### Phase 2 — Micro-cache polling + edge (~1 sprint)

1. Micro-cache `get-current-draw` (3–5s), `get-jackpot` (15s), `get-draw-result` (10ph), `list-draw-results` trang đầu (30s).
2. Đánh giá API Gateway cache cho các endpoint polling (phương án infra-level, có thể thay thế hoặc bổ sung app-level).
3. Thiết lập theo dõi hit-rate qua CloudWatch Logs Insights.

### Phase 3 — L2 Redis (chỉ khi có trigger thật)

**Trigger để khởi động Phase 3** (bất kỳ cái nào):
- Nghiệp vụ yêu cầu khoá tenant/game tức thời (< TTL) cross-process.
- Cần distributed lock / rate-limit / idempotency key.
- Operator platform khởi động (session, ví).
- Atlas metrics cho thấy config reads vẫn là bottleneck sau Phase 1 (khó xảy ra).

**Việc cần làm**:
1. Chọn backend theo bối cảnh lúc đó: chưa có VPC → **Upstash** (ap-southeast-1, REST, thêm env là chạy); đã có VPC (operator) → **ElastiCache Serverless Valkey**.
2. Implement `RedisCacheStore` (adapter fail-open trên `RedisRepository`) + `TieredCache` (`l1TtlSec` 10s).
3. Thêm `REDIS_URI` vào SSM + serverless.yml các app cần; bootstrap tự nâng L1 → Tiered khi env có mặt (không sửa consumer).
4. Chuyển invalidation các update use-case sang delete key L2 → staleness bound giảm từ 60s → 10s toàn hệ thống.

## 4. Đo lường thành công

| Metric | Nguồn | Mục tiêu Phase 1 |
|---|---|---|
| Mongo reads/s trên `*_game_configs`, `*_tenant_configs`, `tenants` | Atlas metrics | Giảm ≥ 60% |
| p50/p99 latency place-bet | CloudWatch Lambda duration | Giảm 10–30ms (2 queries bớt) |
| p50/p99 latency `get-entry-feed`, endpoints api-tenant | CloudWatch | Giảm ~5–15ms |
| Cache hit-rate per keyPrefix | Logs Insights | ≥ 90% cho config, ≥ 80% cho tenant-by-apikey |
| Chi phí hạ tầng thêm | — | $0 (Phase 1–2) |
