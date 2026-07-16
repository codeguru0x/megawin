# ADR-0002: Kiến trúc Player Account Management (Operator B2C)

- **Status:** Proposed (chờ team review)
- **Ngày:** 2026-07-11
- **Người quyết định:** Kiến trúc MegaWin Operator
- **Liên quan:** [ADR-0001](./0001-wallet-in-operator-not-core.md) (ví ở operator),
  [ADR-0003](./0003-wallet-ledger-architecture.md) (kiến trúc ledger),
  [ADR-0004](./0004-wallet-player-implementation-plan.md) (kế hoạch triển khai),
  [`operator-platform-design.md`](../../operator-platform-design.md) §12–§13,
  rule `.cursor/rules/operator-monorepo-structure.mdc`

---

## Bối cảnh

Operator (tenant `megawin-play`) cần **player thật** — tự đăng ký, tự đăng nhập, có hồ sơ, có ví — để
phát hành cho khách hàng chơi tiền thật. Core hiện tại KHÔNG có khả năng này:

- Cognito **player pool của core** hoạt động theo mô hình **B2B server-to-server**: tenant server ký JWT
  assertion, gọi `POST /tenant/players/login` (`apps/api-tenant/src/handlers/player-login.ts`), core
  custom-auth verify rồi trả token. Player được map qua `playerExternalId + tenantId`. **Không có**
  username/password, OTP, social login, quên mật khẩu.
- `PlayerAccountEntity` của core (`packages/identity`) là player **thuộc tenant** — không có hồ sơ B2C
  (SĐT, email verified, KYC tier, trạng thái RG...).

Ràng buộc thiết kế (kế thừa từ design doc và ADR-0001):

1. **KHÔNG sửa core.** Operator là một tenant — dùng đúng `api-tenant /player/login` để lấy token chơi game.
2. **Ưu tiên AWS managed service** — team ít người, không tự dựng IdP.
3. **Onboarding < 60 giây** (Tier 1: email/SĐT + OTP, không giấy tờ) — progressive KYC (§12.3 design doc).
4. Player account là **tiền đề của ví**: mọi account ledger `player:{id}:*` (ADR-0003) treo trên
   `playerId` nội bộ do context này phát hành.

## Các phương án đã cân nhắc

### Tầng IdP cho player B2C

- **A. Cognito User Pool RIÊNG cho operator** — managed, có sẵn OTP/SMS/email, social login, MFA,
  Managed Login (hosted UI) cho SSO cross-app; pattern better-auth + Cognito đã chạy thật ở `apps/backoffice`.
- **B. better-auth thuần trên Postgres** — kiểm soát UX sâu (passwordless, custom onboarding), nhưng tự
  gánh OTP delivery, token lifecycle, bảo mật credential store; và **mất SSO native** giữa nhiều app client (§13 design doc).
- **C. Dùng chung Cognito player pool của core** — bị loại ngay: pool core là B2B, không có self-service
  flow; trộn player thật vào phá ranh giới multi-tenant của core.

### Nơi lưu hồ sơ player (profile, KYC state, RG state)

- **P1. MongoDB (`@megawin/data`)** trong package `operator-core` — đồng bộ stack, hồ sơ là dữ liệu
  document-shaped, không cần ACID đa bảng.
- **P2. Postgres chung với ledger** — kéo mọi đọc/ghi profile vào DB tài chính, tăng tải và blast radius
  của thành phần rủi ro cao nhất.

## Quyết định

**Chọn A + P1: Kiến trúc identity 2 tầng — Cognito User Pool riêng của operator làm IdP (tầng 1),
map sang Cognito core qua `api-tenant` (tầng 2). Hồ sơ player lưu MongoDB trong `operator-core`.
Ledger KHÔNG lưu profile; profile KHÔNG lưu số dư.**

### 1. Sơ đồ tổng thể

```
┌─────────────────── TẦNG 1 — Operator IdP (MỚI) ────────────────────────────┐
│  Amazon Cognito User Pool "megawin-play-players"                            │
│  Managed Login domain: auth.<operator-domain>                               │
│  · Đăng ký email/SĐT + OTP (custom auth / passwordless)                     │
│  · Social login (Google/Facebook/Zalo qua OIDC) — bật sau MVP               │
│  · App clients: operator-web, (game-web team khác), backoffice-support      │
│  · Lambda triggers: PreSignUp (eligibility), PostConfirmation (provision)   │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │ sub (Cognito) ←→ playerId (nội bộ)
┌──────────────────────────────▼──────────────────────────────────────────────┐
│  OPERATOR PLAYER CONTEXT — packages/operator-core(-application), Mongo      │
│  PlayerDoc: playerId (ULID) · cognitoSub · phone/email · displayName        │
│             kycTier (0|1|2|3) · status (active|suspended|self_excluded)     │
│             playerExternalId (map sang core) · riskFlags · rgLimits         │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │ playerExternalId + tenantId="megawin-play"
┌──────────────────────────────▼──────────────────────────────────────────────┐
│  TẦNG 2 — Core B2B (GIỮ NGUYÊN)                                             │
│  BFF gọi POST /tenant/players/login (server-to-server, API key + IP wl)     │
│  → nhận Cognito CORE token → dùng player-sdk chơi game                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 2. Định danh — 3 loại ID, vai trò tách bạch

| ID | Phát hành bởi | Dạng | Dùng ở đâu |
|---|---|---|---|
| `cognitoSub` | Cognito operator pool | UUID | JWT claims; KHÔNG dùng làm khóa nghiệp vụ |
| **`playerId`** | Operator (khi provision) | **ULID/UUIDv7** | **Khóa chính nội bộ**: PlayerDoc, ledger account `player:{playerId}:cash`, audit, ticket |
| `playerExternalId` | Operator (derive từ playerId) | alphanumeric 4–32 (constraint core) | CHỈ để gọi core `player-login` + đối chiếu callback (`playerId` field trong TransactionRequest của core = giá trị này) |

Quy tắc:

- `playerId` là **nguồn chân lý danh tính**. Đổi SĐT/email/cognito không đổi `playerId`.
- `playerExternalId` sinh **một lần duy nhất** từ playerId (VD strip ULID về alphanumeric lowercase),
  lưu vào PlayerDoc, **bất biến**. Callback từ core (ADR-0003) resolve
  `playerExternalId → playerId` để tìm đúng account ledger.
- KHÔNG cho player tự chọn `playerExternalId` — tránh trùng, tránh lộ semantics.

### 3. Luồng đăng ký & đăng nhập (Tier 1 — mục tiêu < 60 giây)

```
[1] Player nhập SĐT (hoặc email) trên operator-web
[2] Cognito custom-auth: gửi OTP (SNS SMS / SES email)
[3] Player nhập OTP → Cognito xác nhận → user CONFIRMED
[4] PostConfirmation Lambda trigger:
      · Sinh playerId (ULID) + playerExternalId
      · Ghi PlayerDoc (Mongo) — kycTier=1, status=active
      · Publish event PLAYER_REGISTERED (EventBridge) → screening ngầm
        (sanctions/PEP, device/IP velocity — chạy nền, không chặn UX)
      · Gọi operator-wallet-svc mở account ledger player:{id}:cash|bonus|locked
        (idempotent — nếu fail, JIT provisioning ở lần đầu chạm ví, xem §5)
[5] operator-web (BFF better-auth) nhận OIDC code → session HttpOnly cookie
[6] Khi player vào game lần đầu: BFF gọi api-tenant /player/login
      → cache core token server-side (TTL ngắn) → player-sdk hoạt động
```

Đăng nhập lại: OIDC Authorization Code + PKCE qua Managed Login → SSO cookie 1h của Cognito cho phép
app thứ 2 (game-web) lấy token **không đăng nhập lại** (§13.2 design doc). Session dài hạn do BFF
mỗi app tự quản (better-auth, refresh server-side).

### 4. Hồ sơ player — PlayerDoc (Mongo, `operator-core`)

**Nguyên tắc tách DB:** dữ liệu player/wallet của operator nằm trên **MongoDB cluster/project RIÊNG**
(`operator-identity`, `operator-audit`…), **không** ghi vào 6 DB của core (`megawin-*`). Lý do:
(1) blast radius — sự cố/migration của operator không đụng core và ngược lại; (2) ranh giới
"operator là một tenant" phải đúng cả ở tầng data. Schema thiết kế **single-tenant** cho riêng operator;
nếu sau này làm PAM-as-a-Service (phương án B, [ADR-0005](./0005-reassess-pam-as-a-service.md)), dịch vụ
PAM sẽ có DB riêng của nó — kế thừa **base** schema/repo từ đây (xem delta plan ADR-0005). Code layer
vẫn reuse `@megawin/data` (pattern connector/repo), chỉ khác connection string.

Chỉ liệt kê nhóm field và bất biến; schema chi tiết chốt lúc implement:

- **Identity:** `playerId` (PK), `cognitoSub` (unique), `playerExternalId` (unique), `phone`/`email`
  (unique, verified flags), `displayName`.
- **Compliance:** `kycTier` (0–3 theo §12.3), `kycDocuments` (ref S3+KMS, chỉ metadata),
  `riskFlags`, `sanctions/PEP screening result` (cached, có TTL re-check).
- **Responsible Gaming:** `rgLimits` (deposit/loss/session), `selfExclusion` (from/to, permanent).
- **Trạng thái:** `status: active | suspended | self_excluded | closed` — **enforcement nằm ở đây**,
  không nằm trong ledger. Ledger chỉ từ chối khi account bị đóng băng (`frozen` flag đồng bộ từ status).
- **Bất biến:** PlayerDoc KHÔNG chứa balance (ledger là SSOT — ADR-0003); ledger KHÔNG chứa PII.
  Mọi thay đổi `status`/`kycTier`/`rgLimits` ghi `@megawin/audit`.

### 5. Provisioning ví — event-driven + JIT fallback

Mở account ledger cho player mới là thao tác **cross-context** (player context → wallet context):

- **Đường chính:** PostConfirmation → gọi `operator-wallet-svc` mở 3 account (`cash`, `bonus`, `locked`).
- **Lưới an toàn (JIT):** mọi API của wallet-svc khi gặp `playerId` hợp lệ (verify PlayerDoc tồn tại)
  mà chưa có account → tự mở account với balance 0, idempotent theo `playerId`.
  → đăng ký không bao giờ fail vì wallet-svc tạm down; không cần distributed transaction.

### 6. Ai làm gì — trách nhiệm mỗi thành phần

| Thành phần | Trách nhiệm | KHÔNG làm |
|---|---|---|
| Cognito operator pool | credential, OTP, MFA, SSO cross-app, token OIDC | business rule, profile |
| `operator-core` / `operator-core-application` | PlayerDoc, KYC state machine, RG limits, map external ID | giữ tiền, credential |
| `operator-auth` (package) | better-auth config chung, verify JWT (JWKS), map session → playerId, service lấy/cache core token | tự phát hành token |
| `operator-api` (BFF Lambda) | endpoints đăng ký/hồ sơ/kyc-status, orchestrate login core | ghi ledger trực tiếp |
| `operator-wallet-svc` | mở account ledger theo playerId (ADR-0003) | biết PII (chỉ nhận playerId) |
| `operator-backoffice` | staff xem/duyệt KYC, suspend, điều chỉnh RG | — |

### 7. Bản đồ AWS cho context này

| Nhu cầu | Dịch vụ AWS | Ghi chú |
|---|---|---|
| IdP player | **Cognito User Pool** (pool riêng, Managed Login, custom auth Lambda) | Essentials tier đủ cho OTP/passwordless |
| OTP SMS / email | **SNS** (SMS) / **SES** (email) | qua Cognito trigger `CustomSMSSender`/built-in |
| Provision + screening nền | **Lambda triggers** (PreSignUp, PostConfirmation) + **EventBridge** | screening không chặn đăng ký |
| Hồ sơ player | **MongoDB Atlas** — **cluster/project riêng của operator** (DB `operator-identity`), reuse code `@megawin/data`, KHÔNG chung cluster `megawin-*` | tách blast radius; base kế thừa được khi làm B (ADR-0005) |
| Tài liệu KYC | **S3 + KMS** (bucket riêng, Object Lock cho audit) | PlayerDoc chỉ giữ metadata/ref |
| KYC Tier 2 (tài liệu) | **Tự xây** trong `operator-kyc`: upload S3+KMS, hàng đợi duyệt tay trên backoffice (maker-checker) | P2, không nằm trong MVP; không thuê eKYC bên thứ 3 |
| Secrets (API key gọi core, better-auth secret) | **Secrets Manager** | rotate được |
| Audit | `@megawin/audit` (Mongo) + CloudWatch | mọi thay đổi status/kyc |

## Lý do

- **Cognito pool riêng thắng better-auth thuần** vì: (1) SSO native nhiều app client — yêu cầu đã chốt
  §13 (game-web do team khác làm); (2) OTP/MFA/social là managed, không tự vận hành credential store cho
  sản phẩm tiền thật; (3) pattern better-auth + Cognito đã chạy thật ở backoffice — reuse, không học mới.
  better-auth vẫn hiện diện — làm **BFF session layer** per-app, đúng vai trò của nó.
- **Profile ở Mongo, không ở Postgres:** profile là dữ liệu đọc nhiều, shape tiến hoá nhanh (KYC, RG,
  risk flags), không cần ACID đa bảng. Giữ Postgres **chỉ cho tiền** đúng tinh thần ADR-0001 — DB tài
  chính càng ít client càng an toàn, migration profile không bao giờ đụng ledger.
- **`playerId` nội bộ tách khỏi `cognitoSub`:** cho phép đổi IdP về sau (revisit trigger), merge account
  (SĐT đổi chủ), và giữ ledger account code ổn định vĩnh viễn — sửa sau này là **cực đắt** vì account
  code nằm trong hàng triệu dòng ledger bất biến.
- **JIT provisioning ví** loại bỏ nhu cầu saga/distributed transaction giữa 2 context ngay từ MVP.

## Hệ quả

**Tích cực:**
- Player đăng ký < 60s, không tường KYC; compliance chạy nền đúng §12.3.
- Không sửa core; dogfood đúng luồng `player-login` B2B.
- SSO sẵn sàng cho game-web của team khác (chỉ cần thêm app client).

**Tiêu cực / cần lưu ý:**
- 2 tầng token (operator + core) → BFF phải quản lifecycle/cache core token; thêm 1 điểm hỏng khi core
  login chậm. Mitigation: cache token server-side, circuit breaker, player vẫn xem được ví khi core down.
- Cognito Managed Login tuỳ biến UI có giới hạn; nếu UX đăng ký cần vượt giới hạn → dùng Cognito API
  trực tiếp từ operator-web (custom UI + `InitiateAuth`), vẫn giữ pool.
- Phí SMS OTP thật (SNS) — cần ngưỡng rate-limit chống OTP bombing từ ngày đầu (WAF + Cognito advanced security).

## Điều kiện xem xét lại

1. Cognito không đáp ứng UX passwordless/onboarding mà marketing yêu cầu → cân nhắc better-auth thuần
   (chấp nhận mất SSO native, thay bằng shared parent-domain cookie §13.3-②).
2. Mở thị trường ngoài VN cần đa currency/đa region → xem lại pool topology.
