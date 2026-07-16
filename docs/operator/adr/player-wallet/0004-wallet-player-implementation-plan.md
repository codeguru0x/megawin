# ADR-0004: Kế hoạch triển khai Player Account + Wallet (từng bước)

- **Status:** Proposed (chờ team review)
- **Ngày:** 2026-07-11
- **Người quyết định:** Kiến trúc MegaWin Operator
- **Liên quan:** [ADR-0001](./0001-wallet-in-operator-not-core.md),
  [ADR-0002](./0002-player-account-architecture.md) (kiến trúc player),
  [ADR-0003](./0003-wallet-ledger-architecture.md) (kiến trúc ví),
  [`operator-platform-design.md`](../../operator-platform-design.md) §8 (roadmap P0–P5)

---

## Bối cảnh

ADR-0002/0003 chốt kiến trúc player + ví. ADR này chuyển kiến trúc thành **trình tự thi công** —
mỗi phase có deliverable chạy được, tiêu chí nghiệm thu, và nguyên tắc "đường nào trước đường nào sau".
Đây là cơ sở để lên plan chi tiết (`.cursor/plans/operator/*`) cho từng phase.

Nguyên tắc xuyên suốt:

1. **Ledger trước, mọi thứ sau.** Không có gì đụng tiền trước khi ledger + reconcile đứng vững.
2. **Mỗi phase kết thúc bằng một luồng e2e chạy thật** — không có phase "chỉ code nền".
3. **Dogfood contract core sớm nhất có thể** — phát hiện lệch contract khi còn rẻ.
4. **Không kéo P2+ vào MVP:** PSP tự động, KYC tài liệu, bonus, affiliate — cắm mốc chờ.

## Quyết định

Chia 6 phase. Mỗi phase phải xong tiêu chí nghiệm thu mới sang phase kế.

```
Phase 0 ── Hạ tầng nền + skeleton package          (IaC, DB, CI)
Phase 1 ── Ledger core + reconcile                 (tiền "trên giấy", chưa ai chạm)
Phase 2 ── Callback contract + nối core            (chơi game bằng ví thật, nạp tay)
Phase 3 ── Player identity + onboarding            (player tự đăng ký, tự đăng nhập)
Phase 4 ── Player wallet API + My Account          (player tự xem ví, lịch sử)
Phase 5 ── Deposit PSP đầu tiên + Withdrawal v1    (tiền thật vào/ra)
```

Phase 1–2 (ví) và Phase 3 (player identity) **có thể chạy song song** bởi 2 người khác nhau —
chúng chỉ gặp nhau ở Phase 4 qua `playerId`.

---

### Phase 0 — Hạ tầng nền + skeleton (≈ 1 tuần)

Mục tiêu: khung monorepo + hạ tầng stateful tối thiểu, CI chạy.

| # | Việc | Ghi chú |
|---|---|---|
| 0.1 | Tạo packages: `operator-core`, `operator-core-application`, `operator-wallet`, `operator-wallet-application`, `operator-data-sql` | theo layering rule §6; barrel + subpath exports chuẩn |
| 0.2 | Tạo apps skeleton: `operator-api` (serverless.yml như api-player), `operator-wallet-svc` (Dockerfile + healthcheck), `operator-worker-reconcile` | build được, deploy stage dev |
| 0.3 | IaC cho stateful: Aurora PG Sv2 (dev: min ACU), VPC private subnets, ECS cluster + service, ElastiCache, Secrets Manager | CDK/Terraform — tách khỏi serverless.yml |
| 0.3b | Mongo Atlas cluster/project **riêng cho operator** (`operator-identity`, `operator-audit`) — KHÔNG dùng chung cluster `megawin-*` | nguyên tắc tách DB (ADR-0002 §4, ADR-0005); reuse code `@megawin/data` |
| 0.4 | `operator-data-sql`: pg pool + transaction helper + migration tooling | migration đầu tiên: bảng theo guide §2 (single-tenant — KHÔNG cột `tenant_id`, xem ADR-0005 delta plan cho B) |
| 0.5 | dependency-cruiser rules: `no-core-to-operator`, `operator-import-core-allowlist` | enforce boundary từ ngày 0 |
| 0.6 | CI: check-types + test + lint cho nhánh `operator-*` qua `turbo --filter` | |

**Nghiệm thu:** `turbo run build --filter='./apps/operator-*' --filter='./packages/operator-*'` xanh;
Aurora dev truy cập được từ wallet-svc; migration chạy tạo đủ bảng.

---

### Phase 1 — Ledger core + reconcile (≈ 2 tuần)

Mục tiêu: ledger double-entry đúng chuẩn guide, chưa expose ra ngoài, test dày.

| # | Việc | Ghi chú |
|---|---|---|
| 1.1 | Domain `operator-wallet`: entities (`Account`, `LedgerEntry`, `LedgerTransaction`), sign convention, account-code builder (`player:{id}:cash`…), rule cân bằng `Σ=0` | thuần logic, 100% unit-testable; domain sạch để kế thừa khi làm B (ADR-0005) |
| 1.2 | `operator-wallet-application`: `ExecuteTransactionUseCase` — 1 DB transaction: idempotency check (external_ref UNIQUE) → FOR UPDATE entry cuối → guard → INSERT entries + `balance_after` | theo guide §3.2 |
| 1.3 | Hỗ trợ `force` (âm ví), multi-leg transaction (≥2 entries), `GetBalance` / `ListEntries` (cursor theo seq) | |
| 1.4 | Trigger `forbid_mutation` + role app INSERT/SELECT-only + `CHECK` constraints | enforce ở DB, không chỉ app |
| 1.5 | `operator-wallet-svc`: HTTP API nội bộ bọc use-cases (`POST /internal/transactions`, `GET /internal/accounts/:code/balance`…) + auth service-to-service | |
| 1.6 | `operator-worker-reconcile` v1: `Σ=0`, chuỗi `balance_after`, cache=ledger; CloudWatch alarm | chạy schedule từ ngày đầu |
| 1.7 | Test: concurrency (100 debit song song 1 account → không overspend), idempotency replay, crash giữa transaction | test này là deliverable chính của phase |

**Nghiệm thu:** stress test đồng thời không sinh overspend/mất cân; replay cùng `external_ref` trả
`duplicate`; reconcile xanh; kill -9 wallet-svc giữa chừng không để trạng thái nửa vời.

---

### Phase 2 — Callback contract + nối core (≈ 1.5 tuần)

Mục tiêu: operator là tenant `megawin-play` thật; chơi 1 game e2e bằng ví thật (nạp tay).

| # | Việc | Ghi chú |
|---|---|---|
| 2.1 | Đăng ký tenant `megawin-play` trên core (dev): API key, IP whitelist, `commissionRate` | thao tác vận hành, không sửa core |
| 2.2 | `operator-api`: 4 callback endpoints (ADR-0003 §4) — auth api-key, resolve playerExternalId→playerId, gọi wallet-svc | contract theo `callback-api-guide.md`, đúng từng error code |
| 2.3 | Batch handler: partial success, per-item idempotent, gom item cùng account tuần tự | |
| 2.4 | Nạp tay (backoffice seed): script/endpoint nội bộ ghi bút toán `house:deposit → player:cash` (maker-checker tối thiểu: 2 người, audit log) | công cụ cho test + vận hành sớm |
| 2.5 | Reconcile v2: đối soát core↔operator theo ngày (`house:stake`/`house:payout` vs báo cáo draw core) | |
| 2.6 | E2E test kịch bản contract: debit đủ/thiếu tiền, timeout→status check (phantom credit), batch payout replay, force debit | dùng test suite mô phỏng core hoặc core dev thật |

**Nghiệm thu:** với player seed tay, **đặt cược 1 game (keno) trên core dev → tiền trừ ở ledger
operator → settle → payout cộng đúng**; đối soát ngày đó khớp 100%; mọi kịch bản retry của core pass.

---

### Phase 3 — Player identity + onboarding (≈ 2 tuần, song song Phase 1–2 được)

Mục tiêu: player tự đăng ký/đăng nhập theo ADR-0002; chưa cần UI hoàn chỉnh.

| # | Việc | Ghi chú |
|---|---|---|
| 3.1 | IaC: Cognito User Pool `megawin-play-players` + Managed Login domain + app client `operator-web`; SNS/SES cho OTP | |
| 3.2 | `operator-core(-application)`: PlayerDoc schema + repo (Mongo) — identity/compliance/RG/status nhóm field theo ADR-0002 §4 | |
| 3.3 | Lambda triggers: PreSignUp (eligibility tối thiểu), PostConfirmation (sinh playerId/playerExternalId, ghi PlayerDoc, publish PLAYER_REGISTERED, gọi mở account ledger) | |
| 3.4 | JIT wallet provisioning trong wallet-svc (fallback) | ADR-0002 §5 |
| 3.5 | `operator-auth` package: better-auth config (pattern backoffice) + session BFF + service map playerId → core token (`api-tenant /player/login`, cache TTL) | |
| 3.6 | `operator-web` skeleton (Next.js 16): đăng ký OTP, đăng nhập, trang trống sau login | đủ để test luồng, chưa cần design |
| 3.7 | Rate-limit/chống OTP bombing (WAF + Cognito threat protection); audit đăng ký/đăng nhập | |

**Nghiệm thu:** đăng ký bằng SĐT/email + OTP **< 60 giây** ra session; PlayerDoc + 3 account ledger
tồn tại; login lần 2 qua Managed Login không cần OTP lại; lấy được core token và gọi 1 API player-sdk.

---

### Phase 4 — Player wallet API + My Account (≈ 1.5 tuần)

Mục tiêu: nối Phase 2 và 3 — player thật chơi tiền thật, tự xem ví.

| # | Việc | Ghi chú |
|---|---|---|
| 4.1 | `operator-api` player endpoints: `GET /me/wallet/balance` (cash/bonus/locked), `GET /me/wallet/transactions` (cursor) | ADR-0003 §5 |
| 4.2 | Redis balance cache (ghi sau commit, fallback DB) | |
| 4.3 | `operator-web` (account): trang Ví — số dư, lịch sử giao dịch | contract ổn định, UI đổi sau |
| 4.4 | `operator-web` (play): nhúng chơi 1 game qua player-sdk với core token từ BFF | |
| 4.5 | E2E full: đăng ký → nạp tay → chơi keno → thắng/thua → lịch sử ví khớp ledger | |

**Nghiệm thu:** một người ngoài team, từ trình duyệt, đăng ký → chơi → xem ví, không cần ai can thiệp
ngoài bước nạp tay; số liệu ví = ledger = báo cáo core.

---

### Phase 5 — Deposit PSP đầu tiên + Withdrawal v1 (≈ 2–3 tuần)

Mục tiêu: tiền thật vào/ra — hoàn thành "phát hành cho khách chơi tiền thật".

| # | Việc | Ghi chú |
|---|---|---|
| 5.1 | Chốt PSP đầu tiên (VNPay/MoMo/VietQR — quyết định mở của design doc §10) | quyết định kinh doanh, cần chốt trước khi code |
| 5.2 | `operator-payment(-application)`: PSP adapter interface + adapter đầu tiên; depositIntent (Mongo) + webhook handler (verify chữ ký, idempotent theo PSP ref) | chỉ cộng tiền khi webhook verified — không tin redirect |
| 5.3 | Deposit flow e2e: intent → QR/redirect → webhook → ledger `psp:clearing → player:cash` → notify | |
| 5.4 | Withdrawal v1: yêu cầu rút → hold (`cash → locked`) → **duyệt tay 100%** trên backoffice (maker-checker) → `operator-worker-payout` gọi PSP payout (idempotency key per-attempt) → `locked → psp:clearing`; từ chối → release | risk-scoring tự động (LOW/MED/HIGH) để P2 sau |
| 5.5 | Reconcile v3: đối soát PSP (clearing vs settlement file) | |
| 5.6 | Backoffice màn hình tối thiểu: hàng đợi duyệt rút, tra cứu player/giao dịch, điều chỉnh maker-checker | trong `operator-backoffice` |
| 5.7 | Runbook vận hành: lệch đối soát, PSP down, rollback payout sai (force debit) | |

**Nghiệm thu:** nạp thật qua PSP sandbox/production hạn mức nhỏ → chơi → rút về đúng phương thức đã
nạp (closed-loop) → đối soát 3 sổ khớp; replay webhook + retry payout không nhân đôi tiền.

---

## Điểm phải chốt trước khi bắt đầu (blocker có chủ)

| # | Câu hỏi | Cần chốt trước |
|---|---|---|
| B1 | Pháp lý/giấy phép vận hành B2C tại VN (design doc §9) | trước Phase 5 (tiền thật), lý tưởng trước Phase 3 |
| B2 | PSP đầu tiên | Phase 5 |
| B3 | IaC tool cho stateful: CDK hay Terraform | Phase 0 |
| B4 | Domain vận hành (`auth.<domain>`, cookie domain cho SSO) | Phase 3 |
| B5 | Ngưỡng deposit limit cho Tier 1 (chưa KYC tài liệu) | Phase 5 |

## Ngoài phạm vi (đã cắm mốc, KHÔNG làm trong plan này)

KYC tài liệu tự xây (Tier 2 — P2: upload + duyệt tay backoffice), risk-scoring rút tự động (P2), bonus/wagering (P5), affiliate (P3),
đại lý tiền mặt (P4), tách authorization/recording SQS FIFO (revisit trigger ADR-0003), Customer Service.

## Hệ quả

**Tích cực:**
- Mỗi phase một deliverable e2e — phát hiện sai kiến trúc sớm, đặc biệt contract core (Phase 2).
- 2 track song song (ví / identity) khớp team ít người, gặp nhau ở một điểm nối duy nhất (`playerId`).
- Tiền thật chỉ xuất hiện ở Phase 5 — khi ledger + reconcile đã được vận hành thật 4 phase.

**Tiêu cực / cần lưu ý:**
- Nạp tay tồn tại từ Phase 2–4 — phải có maker-checker + audit ngay từ đầu, không "làm tạm".
- Ước lượng thời gian là mốc tương đối cho 1–2 dev/track; stress test Phase 1 và integration Phase 2
  là hai chỗ dễ trượt nhất — không cắt ngắn.

## Điều kiện xem xét lại

1. Phase 2 phát hiện contract core thiếu/lệch cho use-case operator → mở ADR riêng về thay đổi
   contract (thay đổi core phải có ADR, vì ảnh hưởng mọi tenant).
2. B1 (pháp lý) không thông → dừng ở Phase 4 (đủ demo/soft-launch nội bộ, không tiền thật).
