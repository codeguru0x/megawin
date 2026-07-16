# ADR-0003: Kiến trúc Wallet & Ledger (Operator B2C)

- **Status:** Proposed (chờ team review)
- **Ngày:** 2026-07-11
- **Người quyết định:** Kiến trúc MegaWin Operator
- **Liên quan:** [ADR-0001](./0001-wallet-in-operator-not-core.md) (vì sao ví ở operator),
  [ADR-0002](./0002-player-account-architecture.md) (playerId — chủ sở hữu account ledger),
  [ADR-0004](./0004-wallet-player-implementation-plan.md) (kế hoạch triển khai),
  [`wallet-double-entry-ledger-guide.md`](../../wallet-double-entry-ledger-guide.md) (nguyên lý + schema chi tiết),
  [`operator-platform-design.md`](../../operator-platform-design.md) §5–§6, §11.4,
  `packages/tenant-gateway/callback-api-guide.md` (contract 4 callback endpoint)

---

## Bối cảnh

ADR-0001 đã chốt: ví sống ở `operator-wallet`, operator là tenant `megawin-play` của core.
ADR này chốt **kiến trúc cụ thể** của ví: engine DB, runtime compute, cách implement 4 callback
endpoint của core, luồng ghi đồng bộ hay bất đồng bộ, và bản đồ dịch vụ AWS — để ADR-0004 lên
kế hoạch triển khai từng bước.

Yêu cầu phi chức năng (từ design doc + guide):

1. **Strong consistency + ACID**: guard đủ tiền và ghi ≥2 entries phải all-or-nothing.
2. **Idempotency tuyệt đối**: core retry callback (WAL + recovery scheduler + dispatch loop 10 vòng);
   PSP gửi lại webhook. Retry không được nhân đôi tiền.
3. **Latency debit thấp**: debit `bet` nằm trên đường nóng place-bet của core (đồng bộ).
4. **Provable**: mọi số dư chứng minh được từ ledger; `Σ(all entries) = 0` mọi thời điểm.
5. **Đối soát 3 sổ** (ledger operator ↔ sổ core ↔ sao kê PSP) từ ngày đầu.

## Các phương án đã cân nhắc

| # | Phương án | Nhận xét |
|---|---|---|
| E1 | **Aurora PostgreSQL** (Serverless v2) | ACID + `FOR UPDATE` + CHECK/trigger; team biết SQL; failover Multi-AZ |
| E2 | RDS PostgreSQL thường | Như E1, rẻ hơn ở tải thấp, scale kém linh hoạt hơn |
| E3 | TigerBeetle | Chuyên dụng, nhanh nhất — nhưng hệ vận hành riêng, quá tay cho MVP |
| E4 | DynamoDB | Transaction giới hạn 25/100 item, reconcile bằng SUM/join khó |
| R1 | **wallet-svc dài hạn trên ECS Fargate** | connection pool ổn định, transaction dài, không cold-start |
| R2 | Lambda + RDS Proxy | rẻ hơn khi idle, nhưng thêm Proxy hop + cold-start trên đường nóng debit |
| W1 | **Ghi ledger đồng bộ trong request** | đơn giản, an toàn, đúng cho MVP |
| W2 | Tách authorization ↔ recording (SQS FIFO) | throughput cao hơn, thêm eventual complexity — chưa cần |

## Quyết định

**E1 + R1 + W1: Aurora PostgreSQL Serverless v2 làm ledger (SSOT); `operator-wallet-svc` là service
dài hạn trên ECS Fargate — nơi DUY NHẤT được nối vào Postgres ledger; MVP ghi ledger đồng bộ trong
request. Redis chỉ là cache đọc, không bao giờ là guard.**

### 1. Sơ đồ tổng thể

```
                    MEGAWIN CORE (RGS — không sửa)
     place-bet ──► debit callback          settle ──► batch payout callback
          │                                     │
          ▼                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│  operator-api (Lambda BFF) — LỚP CALLBACK + LỚP PLAYER API             │
│  · POST /callback/transaction          · GET /me/wallet/balance        │
│  · POST /callback/transaction/batch    · GET /me/wallet/transactions   │
│  · GET  /callback/transaction/:tx/status                               │
│  · GET  /callback/balance                                              │
│  (auth: x-api-key + x-tenant-id cho callback; JWT operator cho player) │
└──────────────────────────┬─────────────────────────────────────────────┘
                           │ HTTP nội bộ (VPC, private ALB) — API contract ổn định
┌──────────────────────────▼─────────────────────────────────────────────┐
│  operator-wallet-svc (ECS Fargate, ≥2 task, private subnet)            │
│  · WalletCommandService: debit / credit / hold / release / transfer    │
│  · Guard + double-entry write trong 1 DB transaction (FOR UPDATE)      │
│  · Idempotency: ledger_transactions.external_ref UNIQUE = tx của core  │
│  · Chỉ nhận playerId (ADR-0002) — không PII                            │
└───────┬──────────────────────────────────────────────┬─────────────────┘
        │ pool (pg)                                    │ sau commit
┌───────▼───────────────────────┐          ┌───────────▼──────────────────┐
│  Aurora PostgreSQL Sv2        │          │  ElastiCache Redis           │
│  accounts / ledger_transactions│          │  balance cache (đọc nóng)   │
│  ledger_entries (append-only, │          │  + EventBridge: WALLET_*     │
│  balance_after) / snapshots   │          │  events cho notify/BI/risk   │
└───────────────────────────────┘          └──────────────────────────────┘
```

### 2. Mô hình dữ liệu — theo đúng `wallet-double-entry-ledger-guide.md`

Áp dụng nguyên xi schema §2 của guide (không lặp lại ở đây), với các chốt bổ sung:

**Nguyên tắc DB ([ADR-0005](./0005-reassess-pam-as-a-service.md)):** Aurora ledger là cluster **riêng
của operator**, không dây dưa gì với DB core (`megawin-*`). Schema ở đây là **single-tenant** — thiết kế
cho đúng một mình operator dùng, KHÔNG thêm cột `tenant_id` hay prefix tenant vào account code. Khi làm
phương án B, dịch vụ PAM sẽ có **DB riêng của nó** (dựng mới) — kế thừa base schema/migration/logic từ
đây và thêm chiều tenant lúc đó (xem delta plan ở ADR-0005).

Các chốt cụ thể:

- **Chart of accounts khởi điểm (P0–P1):**
  - `player:{playerId}:cash` · `player:{playerId}:bonus` · `player:{playerId}:locked`
  - `house:stake` · `house:payout` · `house:deposit` · `house:withdrawal` · `house:adjustment`
  - `psp:{provider}:clearing` (P1, khi có PSP đầu tiên)
  - `agent:*` (P3+ — KHÔNG tạo sớm)
- **`allow_negative`:** chỉ `house:*` và `psp:*:clearing`. Ví player có `CHECK` không âm —
  NGOẠI TRỪ xử lý `force: true` (xem §4.3).
- **`balance_after`** trên mỗi entry (đọc O(1), verify mắt xích O(1)) + **snapshot định kỳ**
  (mốc reconcile + archive) — kiến trúc kết hợp §5.4 của guide.
- **Append-only enforce ở DB:** trigger `forbid_mutation` + role app chỉ có `INSERT/SELECT`
  trên `ledger_entries`.
- **Đơn vị tiền:** `BIGINT` VND. Không float, không decimal.
- **Config ví tập trung:** currency, limits, PSP set, `allow_negative` policy đọc từ một config
  object/document duy nhất (`wallet_config`) — không rải hằng số trong code. Khi làm B, config này
  generalize thành `tenant_wallet_configs` (delta plan ADR-0005).
- **Migration tool:** `node-pg-migrate` (hoặc drizzle-kit) trong `operator-data-sql`; mọi thay đổi
  schema ledger qua migration có review, không sửa tay.

### 3. Mapping nghiệp vụ → bút toán

| Nghiệp vụ | Trigger | Bút toán (debit −, credit +) |
|---|---|---|
| Nạp tiền thành công | PSP webhook verified | `psp:{p}:clearing` − / `player:cash` + |
| Đặt cược (`reason: bet`) | core debit callback | `player:cash` − / `house:stake` + |
| Rollback bet (`reason: rollback`) | core credit callback | `house:stake` − / `player:cash` + |
| Trả thưởng (`reason: payout`) | core batch credit | `house:payout` − / `player:cash` + |
| Hoàn tiền void (`reason: refund`) | core batch credit | `house:stake` − / `player:cash` + |
| Yêu cầu rút | player action | `player:cash` − / `player:locked` + |
| Rút được duyệt + PSP payout | worker payout | `player:locked` − / `psp:{p}:clearing` + |
| Rút bị từ chối | staff action | `player:locked` − / `player:cash` + |
| Điều chỉnh thủ công | backoffice (maker-checker) | `house:adjustment` ↔ `player:cash` |
| Bonus cấp phát (P5) | promotion engine | `house:adjustment` − / `player:bonus` + |

Ghi chú: MVP **không** dùng `player:locked` cho bet (bet trừ thẳng `cash` → `house:stake`, khớp semantics
callback của core: debit = tiền đã trừ). `locked` chỉ dùng cho luồng rút tiền.

### 4. Implement 4 callback endpoint của core

Contract: `packages/tenant-gateway/callback-api-guide.md`. Operator là "tenant mẫu" — phải đúng 100%.

#### 4.1 `POST /transaction` (bet debit, rollback credit, bonus, adjustment)

```
1. Auth x-api-key + x-tenant-id (Secrets Manager).
2. Resolve playerId từ playerExternalId (request.playerId) — PlayerDoc (ADR-0002).
   Không thấy → PLAYER_NOT_FOUND.
3. Gọi wallet-svc: executeTransaction({ externalRef: tx, type: reason, ... })
   Trong MỘT DB transaction:
   a. INSERT ledger_transactions (id, type, external_ref=tx) — nếu UNIQUE violation
      → tx đã xử lý → SELECT kết quả cũ, trả duplicate: true (idempotent).
   b. FOR UPDATE entry cuối của account player → guard đủ tiền
      (bỏ guard khi force: true — cho phép âm, xem 4.3).
   c. INSERT 2 entries cân nhau + balance_after.
4. Trả { success: true, data: { tx, balance, currency } }.
   Lỗi nghiệp vụ (INSUFFICIENT_BALANCE, WALLET_FROZEN) → HTTP 200 + success: false.
   Lỗi hạ tầng CHƯA ghi gì → HTTP 502/503 để core retry (KHÔNG lưu tx khi lỗi nội bộ
   — rule bắt buộc của contract, tránh entry bị reject vĩnh viễn).
```

#### 4.2 `POST /transaction/batch` (payout/refund ≤ 50 items)

- Xử lý **từng item độc lập** (partial success). Mỗi item = 1 DB transaction riêng, idempotent theo `tx`.
- Gom items **cùng account** xử lý tuần tự trong 1 connection (đúng thứ tự `balance_after`);
  khác account chạy song song có giới hạn (p-limit) để không bão hòa pool.
- Trả `results[]` cùng thứ tự, `results.length === items.length`.

#### 4.3 `force: true` (thu hồi payout sai)

- Bỏ guard balance → ví player **được phép âm** cho riêng transaction này.
- Postgres CHECK không âm áp trên **bảng cache** `account_balances` (nếu dùng), không áp trên
  ledger — với entry `force`, ghi thẳng ledger với `balance_after` âm và set `riskFlags` trên
  PlayerDoc (`negative_balance`) để chặn cược tiếp cho tới khi nạp bù.

#### 4.4 `GET /transaction/:tx/status` & `GET /balance`

- Status: đọc `ledger_transactions` theo `external_ref`. Tồn tại → `success: true` + `processedAt`.
  Không → `success: false, code: NOT_FOUND`. **Rule vàng:** `success: true` ↔ tiền đã committed.
  Đây là chốt chặn phantom-credit của core — không "làm đẹp" response.
- Balance: đọc `balance_after` entry cuối (O(1)) hoặc Redis; **chỉ trả ví `cash`** (main wallet
  theo contract).

### 5. Player-facing wallet API (qua `operator-api` BFF)

Nhóm endpoint cho "My Account" (§11.3 design doc) — contract ổn định để UI đổi thoải mái:

| Endpoint | Nguồn dữ liệu |
|---|---|
| `GET /me/wallet/balance` | Redis cache → fallback `balance_after` (cash + bonus + locked tách riêng) |
| `GET /me/wallet/transactions` | `ledger_entries` join `ledger_transactions` (cursor pagination theo `seq`) |
| `POST /me/wallet/deposits` | tạo depositIntent (ADR-0004 Phase 5 — PSP đầu tiên) |
| `POST /me/wallet/withdrawals` | tạo yêu cầu rút + hold (ADR-0004 Phase 5) |

Auth: JWT operator (ADR-0002) → `playerId` → chỉ đọc account của chính mình. BFF **không bao giờ**
query Postgres trực tiếp — luôn qua wallet-svc.

### 6. Consistency, cache, và đối soát

- **Guard LUÔN ở Postgres** (FOR UPDATE / conditional write). Redis chỉ đọc-nhanh, ghi sau commit,
  miss thì fallback DB. (Guide §7.4.)
- **Reconcile job (`operator-worker-reconcile`, Lambda + EventBridge Scheduler) chạy từ P0:**
  1. `SUM(all entries) = 0` — invariant toàn cục.
  2. Chuỗi `balance_after` liên hoàn (sample + full theo lịch).
  3. Cache Redis = ledger (sample).
  4. **Đối soát core↔operator:** so `house:stake`/`house:payout` với báo cáo draw/tenant của core
     (`DrawTenantFinancial`) theo ngày — lệch 1 đồng = CloudWatch alarm.
  5. (P1+) Đối soát PSP: `psp:{p}:clearing` vs sao kê/settlement file.
- **Snapshot job:** chốt `balance_snapshots` hằng ngày; partition `ledger_entries` theo tháng;
  archive partition cũ → S3 Parquet + Athena (sau khi có snapshot bao phủ).

### 7. Bản đồ AWS đầy đủ cho Wallet context

| Nhu cầu | Dịch vụ AWS | Cấu hình chốt |
|---|---|---|
| Ledger DB (SSOT) | **Aurora PostgreSQL Serverless v2** | Multi-AZ, min 0.5 ACU (dev) / 2 ACU (prod), PITR bật, deletion protection |
| Compute ví | **ECS Fargate** (`operator-wallet-svc`) | ≥2 task, private subnet, ALB nội bộ, autoscale theo CPU/conn |
| BFF + callback | **Lambda + API Gateway** (`operator-api`) | như api-player; route callback tách stage/authorizer riêng |
| Cache đọc nóng | **ElastiCache Redis** | reuse pattern `@megawin/cache`; TTL ngắn + invalidate khi ghi |
| Worker payout/reconcile | **Lambda + SQS + EventBridge Scheduler** | idempotency key per-attempt cho payout |
| Luồng rút nhiều bước | **Step Functions** (P2) | reuse pattern settle/void ASL của core |
| Secrets | **Secrets Manager** | DB creds (rotate), callback api-key, PSP keys |
| Network | **VPC private subnets + VPC endpoints** | wallet-svc và Aurora không có public IP; Lambda callback trong VPC |
| Archive ledger | **S3 (Parquet, Object Lock) + Athena** | audit/compliance, immutable |
| Observability | **CloudWatch** metrics/alarms + structured logs | alarm: reconcile lệch, `Σ≠0`, callback error rate, p99 debit latency |
| Hạ tầng as code | Serverless Framework (Lambda) + **CDK hoặc Terraform** cho Aurora/ECS/Redis | phần stateful KHÔNG để serverless.yml quản |

### 8. Cấu trúc package (theo rule monorepo, layering §6)

```
packages/
  operator-core/                 # PlayerId, Money (VND int), shared types operator
  operator-core-application/     # PlayerDoc repo (Mongo), use-cases player
  operator-wallet/               # DOMAIN THUẦN: entities (Account, LedgerEntry,
                                 #   LedgerTransaction), rules (double-entry balance,
                                 #   sign convention, account-code builder), KHÔNG I/O
  operator-wallet-application/   # use-cases (ExecuteTransaction, HoldFunds, ...),
                                 #   infras/repos (Postgres qua operator-data-sql),
                                 #   mappers, idempotency
  operator-data-sql/             # pg pool, migrations, transaction helper
apps/
  operator-api/                  # Lambda BFF: callback endpoints + player wallet API
  operator-wallet-svc/           # ECS Fargate: HTTP service bọc operator-wallet-application
  operator-worker-reconcile/     # Lambda: reconcile jobs + snapshot
  operator-worker-payout/        # Lambda: PSP payout async (P1/P2)
```

Kỷ luật trích xuất (ADR-0001 phương án C): `operator-wallet` domain **không import** bất kỳ khái
niệm operator-specific nào ngoài `operator-core` types — để tương lai trích thành sản phẩm `wallet` B2B.

## Lý do

- **Aurora PG Serverless v2 vs RDS thường:** cùng engine, nhưng Sv2 co giãn theo tải (đêm thấp/giờ
  quay số cao) và failover nhanh hơn; chi phí min-ACU chấp nhận được so với rủi ro ledger. TigerBeetle
  để dành làm revisit trigger — không gánh hệ vận hành lạ cho MVP.
- **ECS Fargate vs Lambda+RDS Proxy cho wallet:** debit nằm trên đường nóng place-bet — cold-start
  Lambda + Proxy hop là latency tax thường trực; service dài hạn giữ pool, transaction ổn định, và cô
  lập "process duy nhất chạm Postgres" — đúng một code path ghi ledger (chống cache lệch, guide §4.1).
- **Ghi đồng bộ (W1) cho MVP:** tải xổ số theo kỳ quay không phải chục nghìn tx/s; tách
  authorization/recording (W2) thêm eventual complexity mà guide chính nó cảnh báo. Thiết kế service
  interface (`WalletCommandService`) sao cho W2 nâng cấp sau được mà không đổi contract.
- **Callback qua `operator-api` (Lambda) rồi mới vào wallet-svc** thay vì expose wallet-svc ra ngoài:
  giữ wallet-svc private tuyệt đối; lớp Lambda làm auth/validation/rate-limit; blast radius nhỏ.

## Hệ quả

**Tích cực:**
- Ledger provable, idempotent, khớp contract core — dogfood thật callback guide.
- Một code path ghi tiền duy nhất → loại cache lệch từ gốc.
- Hạ tầng ECS/Aurora nhỏ (2 task + 1 cluster) nhưng đủ chuẩn tài chính (Multi-AZ, PITR, private).

**Tiêu cực / cần lưu ý:**
- Thêm 2 loại hạ tầng mới cho repo (ECS Fargate, Aurora PG) — cần IaC + runbook vận hành mới
  (deploy, migration, failover drill). Đây là chi phí một lần, đã lường ở ADR-0001.
- Chi phí AWS thường trực (Aurora min ACU + 2 Fargate task + Redis) ngay cả khi chưa có traffic —
  chấp nhận cho thành phần tài chính; dev/staging dùng cấu hình tối thiểu.
- Ghi đồng bộ giới hạn throughput per-account (serialize FOR UPDATE) — đủ cho xổ số theo kỳ;
  hotspot `house:*` xử lý bằng sharding sub-account khi có số liệu thật (guide §7.3).

## Điều kiện xem xét lại

1. p99 debit latency > SLA place-bet của core, hoặc throughput per-account thành bottleneck
   → nâng cấp W2 (SQS FIFO tách recording), sau đó mới cân nhắc TigerBeetle.
2. Yêu cầu compliance buộc tách hard boundary → tách `operator-wallet-svc` sang repo/account AWS
   riêng (đã lường ở design doc §11.1).
3. Có tenant thuê PAM → trích `operator-wallet` domain thành sản phẩm `wallet` (ADR-0001 revisit).
