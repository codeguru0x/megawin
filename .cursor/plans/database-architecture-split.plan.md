# Database Architecture — Split theo Workload (không theo "concern")

> **Scope**: Thiết kế lại topology database cho megawin, ưu tiên performance +
> mở rộng, chuẩn bị cho game lớn tương lai + multi-tenant account management.
> **Bối cảnh**: Giai đoạn "đang tăng trưởng". Nỗi lo chính: (1) report nặng ảnh
> hưởng game I/O, (2) blast radius — 1 game/tính năng lỗi kéo sập cả hệ thống.
> **Nguyên tắc cốt lõi**: Tách **CLUSTER theo workload**, KHÔNG tách logical DB
> theo concern. Logical DB cùng cluster = cùng RAM/CPU/IOPS → tách vô nghĩa.

---

## 1. Hiện trạng (đã khảo sát)

### 1.1 Topology thực tế

- **1 MongoClient → 1 cluster Atlas** duy nhất, chọn DB qua `client.db(dbName)`.
- **2 logical database** trên cùng cluster đó:
  - `megawin` — game data, identity, reports, counters.
  - `megawin-tenant` — tx_logs, tx_intents (WAL), dispatch orders, entry_feed.
- Mọi repo dùng **đúng 1 env key `MONGODB_URI`** (xác nhận grep). `MONGODB_AUDIT_URI`
  chỉ tồn tại trong plan, chưa có code.

### 1.2 Connection layer (đã sẵn sàng để split)

`packages/data/src/mongo/client.ts`:
- `getMongoClient` cache theo `mongoEnvKey` → đổi env key = đổi cluster.
- `getMongoDb` cache theo `${envKey}::${dbName}`.
- `MongoRepository` nhận `mongoEnvKey` + `dbName` qua constructor → **injectable**.

→ Tách cluster = **thêm env key mới + đổi `mongoEnvKey` trong base-repo + migrate
data**. KHÔNG phải sửa query.

### 1.3 3 phát hiện then chốt (quyết định toàn bộ thiết kế)

| Phát hiện | Hệ quả |
|---|---|
| **KHÔNG có `$lookup`/`$unionWith`/`$merge`/`$out`** trong toàn bộ code. Mọi "join" ở app/Step Functions layer (đọc tuần tự nhiều Lambda) | Tách DB **không phá vỡ query nào** |
| **Transaction chỉ ở place-bet**, chỉ touch `{game}_tickets` + `{game}_ticket_entries` cùng game | Ràng buộc co-location DUY NHẤT: cặp này phải cùng cluster |
| **FK `accountId`/`tenantId` là string**, không có constraint DB-level | Tách identity ra cluster riêng chỉ cần app trỏ đúng env key |

> Kiến trúc hiện tại **vốn đã né sẵn các hạn chế khó nhất của Mongo** (no cross-DB
> `$lookup`, no cross-cluster transaction). Việc split chỉ nhắm vào **cô lập tài
> nguyên vật lý**, KHÔNG được phá vỡ điều này.

---

## 2. Quyết định: tại sao KHÔNG "mỗi concern một logical DB"

Đề xuất ban đầu (report riêng, game riêng, account riêng, audit riêng — đều là
logical DB trên cùng cluster) là tư duy RDBMS, **gây hại trên Mongo Atlas**:

- Không cải thiện performance (cùng cluster = cùng tài nguyên).
- Mất khả năng dùng transaction/`$lookup` giữa các nhóm nếu sau này cần.
- Phức tạp vận hành mà không đổi lại lợi ích.

3 khái niệm phải phân biệt:

| Khái niệm | Ảnh hưởng performance/scale |
|---|---|
| **Logical database** (`client.db("x")`) | ~0. Chỉ là namespace |
| **Cluster** (1 `MONGODB_URI`) | **Đây mới quyết định** RAM/IOPS/connection/cô lập tải |
| **Shard** (trong cluster) | Cơ chế scale ngang thật của Mongo |

---

## 3. Kiến trúc đề xuất — 3 cluster

Tách theo **mức độ critical + đặc tính I/O**:

```
┌─────────────────────────────────────────────────────────────────┐
│  CLUSTER 1 — "core"  (OLTP nóng, critical, latency-sensitive)     │
│  MONGODB_URI                                                       │
│  ├── DB megawin-identity                                           │
│  │     accounts, tenants                                           │
│  └── DB megawin-game                                               │
│        {game}_tickets, {game}_ticket_entries   ← TRANSACTION       │
│        {game}_draws, {game}_game_configs, {game}_ticket_lines      │
│        {game}_jackpot_cycles, {game}_jackpot_cycle_entries         │
│        ticket_counters, entry_change_seq, {game}_draw_counters     │
│        worker_locks                                                │
├─────────────────────────────────────────────────────────────────┤
│  CLUSTER 2 — "tenant"  (tích hợp tenant, WAL, dispatch)           │
│  MONGODB_TENANT_URI                                                │
│  └── DB megawin-tenant                                             │
│        tx_logs, tx_intents (WAL), tenant_dispatch_orders,          │
│        entry_feed, feed_sync_cursor                                │
├─────────────────────────────────────────────────────────────────┤
│  CLUSTER 3 — "analytics"  (report + audit; KHÔNG critical)        │
│  MONGODB_ANALYTICS_URI                                             │
│  ├── DB megawin-report                                             │
│  │     player_settle_game_daily,                                   │
│  │     system_settle_game_daily, system_settle_tenant_daily,       │
│  │     system_outstanding_game_daily,                              │
│  │     {game}_settle_draw_reports, {game}_settle_tenant_reports,   │
│  │     {game}_void_draw_reports, {game}_outstanding_draw_reports   │
│  └── DB megawin-audit                                              │
│        audit_logs   ← plan @megawin/audit đặt ở đây, KHÔNG cần     │
│                        cluster thứ 4                               │
└─────────────────────────────────────────────────────────────────┘
```

### 3.1 Lý do từng nhóm

| Trục | Quyết định | Lý do |
|---|---|---|
| Report | Cluster 3 (analytics) | Giải nỗi lo "report nặng ảnh hưởng game". Write-heavy lúc settle + read-heavy lúc xem dashboard → cô lập phần cứng |
| Game | Chung Cluster 1, logical DB `megawin-game`, **CHƯA tách cluster per-game** | Tải đang tăng chứ chưa khổng lồ. Collection prefix per-game sẵn có → khi 1 game lớn, nhấc ra cluster riêng bằng đổi `mongoEnvKey` |
| Tenant | Cluster 2 (giữ nguyên concern) | WAL + dispatch cần cô lập. Sập tenant → game vẫn chạy nhờ WAL recovery |
| Account | Logical DB `megawin-identity` (Cluster 1) | Identity I/O nhẹ + nằm trên critical path (auth) → ở gần game. Tách namespace để sau dễ nhấc ra |
| Audit | DB `megawin-audit` trên Cluster 3 | Analytics-class (write fire-and-forget). Không cần cluster thứ 4 |

### 3.2 Giải quyết trực tiếp 2 nỗi lo

**"Report nặng ảnh hưởng game I/O":** Worker settle aggregate **đọc từ Cluster 1
nhưng GHI report sang Cluster 3** → áp lực write report không đụng game OLTP.
Nâng cao: đọc aggregate từ Analytics Node / read replica của Cluster 1.

**"Blast radius":**
- Cluster 2 sập → game vẫn nhận cược (feed/dispatch delay, có WAL `tx_intents` recovery).
- Cluster 3 sập → nghiệp vụ core vẫn chạy, chỉ mất dashboard tạm. Audit fire-and-forget không ảnh hưởng.
- Mỗi cluster connection pool riêng → Lambda fan-out report không ăn hết connection game.

---

## 4. "Không bị hạn chế Atlas" — kỳ vọng đúng

Tách DB **không gỡ** các giới hạn cốt lõi của Mongo:

| Giới hạn | Tách DB gỡ được? | Cách xử lý thật |
|---|---|---|
| `$lookup` không cross-DB/cluster | ❌ (tách làm khó hơn) | Đang KHÔNG dùng `$lookup` → giữ join ở app-layer |
| Transaction không span cluster | ❌ | Giữ `{game}_tickets`+`entries` cùng cluster |
| Connection limit per tier | ✅ mỗi cluster limit riêng | + cấu hình `maxPoolSize` cho Lambda |
| 16MB/document | ❌ | Thiết kế schema, không nhồi array vô hạn |
| Aggregate nặng ăn RAM primary | ✅ tách analytics cluster | + Analytics node read-only |

---

## 5. Lộ trình tách (low-risk, theo ưu tiên nỗi lo)

Mỗi bước = thêm env key + đổi base-repo `mongoEnvKey` + migrate data. KHÔNG sửa query.

| Bước | Nội dung | Repo/file đổi `mongoEnvKey` | Rủi ro |
|---|---|---|---|
| **1** (ưu tiên — giải report) | Tách Cluster 3 analytics. Report repo + audit repo → `MONGODB_ANALYTICS_URI`. Migrate report collections | report repos trong `game-core-application` + `game-{game}-application`; audit repo (khi làm `@megawin/audit`) | Trung bình (migrate data + đảm bảo worker ghi đúng cluster) |
| **2** (giải blast radius tenant) | Tách Cluster 2. → `MONGODB_TENANT_URI` | `TenantGatewayBaseRepo`, `TenantDispatchBaseRepo`, `MegawinTenantCoreBaseRepo` | Trung bình. Lưu ý cross-cluster write `entry_change_seq`(C1) → `entry_feed`(C2): vẫn OK vì không transaction |
| **3** (chuẩn hóa, bất cứ lúc nào) | Đổi tên logical DB: `megawin` → `megawin-game` + `megawin-identity` (vẫn Cluster 1) | đổi `dbName` trong `IdentityBaseRepo` + per-game `BaseRepo` + `GameCoreBaseRepo` | Thấp (chỉ đổi `dbName`) |
| **4** (chỉ khi 1 game thực sự lớn) | Nhấc game đó sang cluster riêng `MONGODB_GAME_{X}_URI` | per-game `BaseRepo` của game đó | Trung bình. Hạ tầng sẵn sàng nhờ prefix + injectable env key. Giữ tickets+entries cùng cluster |

---

## 6. Co-location bắt buộc (KHÔNG được vi phạm khi split)

```
[CỨNG — transaction, không span cluster]
{game}_tickets  ⟷  {game}_ticket_entries     (place-bet mỗi game) → cùng cluster

[MỀM — cross-DB sequential write, app-layer, không transaction]
entry_change_seq (core) ──stamp version──▶ entry_feed (tenant)
tx_intents (tenant) ──WAL──▶ tenant debit API ──▶ markCompleted
```

- Mọi `{game}_tickets` + `{game}_ticket_entries` của CÙNG game phải cùng cluster.
- Không transaction nào span 2 game / game↔tenant / 2 DB → an toàn tách theo §3.

---

## 7. Chuẩn bị cho tương lai

### 7.1 Game lớn (Bước 4)
- Collection đã prefix per-game → nhấc ra cluster riêng sạch.
- Khi 1 collection (vd `{game}_ticket_entries`) quá lớn → **shard theo `{ tenantId, drawId }`** thay vì tách DB. Đây là scale ngang thật.

### 7.2 Multi-tenant account management
Tương lai "quản lý tài khoản cho tenant không có tài khoản riêng" làm `accounts`
phình to + đa dạng:
- Giữ `accounts`/`tenants` trong `megawin-identity` riêng **ngay từ Bước 3**.
- Thêm index `{ tenantId: 1, ... }` trên `accounts` để filter theo tenant ở quy mô lớn.
- Khi đạt quy mô → **shard key `tenantId`** cho `accounts`.

---

## 8. Caveat cần xác nhận trước khi thực thi

1. Comment `tx-intent-repo.ts` nói "cùng DB với tenant config" nhưng `tenants`
   thực tế ở `megawin` (không phải `megawin-tenant`). Comment lệch thực tế →
   làm rõ trước khi tách identity.
2. Không thấy collection `sessions` — xác nhận auth là stateless JWT hay session
   lưu nơi khác (ảnh hưởng việc tách identity).
3. Lambda concurrency × số cluster sau split = tổng connection tới Atlas → kiểm
   tra connection limit theo tier + set `maxPoolSize` khi chia nhiều cluster.

---

## 9. Nguyên tắc xuyên suốt

1. **Tách cluster theo workload, không tách logical DB theo concern.**
2. **Không phá vỡ pattern hiện có**: no `$lookup`, join ở app-layer, FK string,
   `mongoEnvKey` injectable.
3. **Co-location cứng**: `{game}_tickets`+`{game}_ticket_entries` cùng cluster.
4. **Split = đổi env key + base-repo + migrate**, KHÔNG sửa query.
5. **Scale thật = shard**, không phải tách thêm logical DB.
6. **Critical path (game+identity) tách khỏi non-critical (report+audit+tenant feed).**
