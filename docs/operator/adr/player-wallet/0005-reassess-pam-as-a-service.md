# ADR-0005: Đánh giá lại phương án B — PAM-as-a-Service trong core ngay bây giờ

- **Status:** Proposed — kết luận: **giữ phương án A (ADR-0001), operator single-tenant + delta plan cho B**
- **Ngày:** 2026-07-11
- **Người quyết định:** Kiến trúc MegaWin Operator
- **Liên quan:** [ADR-0001](./0001-wallet-in-operator-not-core.md) (quyết định gốc A + kỷ luật C),
  [ADR-0002](./0002-player-account-architecture.md), [ADR-0003](./0003-wallet-ledger-architecture.md),
  [ADR-0004](./0004-wallet-player-implementation-plan.md)

---

## Bối cảnh

Câu hỏi đặt ra khi review bộ ADR player-wallet: **"Nếu làm luôn phương án B bây giờ — xây
PAM/Wallet-as-a-Service multi-tenant trong core, và operator sắp làm chính là tenant #1 THUÊ toàn bộ
(identity, ví, nạp/rút) — thì giá phải trả là gì? Có tiện lợi và khả thi không?"**

Đây là revisit có chủ đích quyết định của ADR-0001, trước khi bắt tay code. ADR này ghi lại kết quả
khảo sát hiện trạng core + phân tích chi phí/lợi ích, làm cơ sở chốt.

## Hiện trạng core (khảo sát 2026-07-11 — facts, có file path)

Những gì core **đang có** liên quan đến B:

| Hạng mục | Hiện trạng | Nguồn |
|---|---|---|
| Tenant model | `TenantEntity` tối giản: `tenantId`, `displayName`, `status`, `apiKey`, `callbackBaseUrl`. KHÔNG có commissionRate (nằm per-game `TenantConfigDoc`), KHÔNG có IP whitelist thực (chỉ có trong comment) | `packages/identity/src/entities/tenant.ts`, `packages/auth/src/tenant-api-key-auth.ts` |
| Callback dispatch | Hoàn chỉnh và tinh vi: hot-path WAL + recovery 2 phút (`TxIntentDoc`), async outbox (`tenant_dispatch_orders`, retry vô hạn + lock), LRU tenant config, DRY-RUN mode | `packages/game-core-application/src/services/debit-player-service.ts`, `packages/tenant-dispatch`, `apps/worker-tenant-dispatch` |
| Identity B2C | **KHÔNG tồn tại.** Player login là server-to-server (JIT Cognito user, deterministic password, `ADMIN_NO_SRP_AUTH`). Không có register/OTP/password/social cho player | `apps/api-tenant/src/handlers/player-login.ts`, `apps/api-player/src/handlers/auth/` (chỉ có refresh-token) |
| Data layer | **100% MongoDB** (6 DBs). Zero Postgres/SQL driver trong toàn repo | `packages/data/src/mongo/` |
| Runtime | **100% Lambda + Next.js.** Zero Dockerfile, zero ECS/Fargate, zero CDK/Terraform — stateful infra (Cognito, Kinesis) provision ngoài repo | 11 file `apps/*/serverless.yml` |
| Tiền trong core | Core không giữ tiền — chỉ báo cáo (`DrawTenantFinancial`, report 2 tầng trong `megawin-report`). Tenant-facing revenue API còn là stub | `packages/game-core/src/types/index.ts`, `apps/api-tenant/src/handlers/get-reports.ts` |
| Tenant thật | **Chưa có tenant production nào trong repo** (chỉ mock dev key) | `apps/api-tenant/scripts/dev.mjs` |

Kết luận khảo sát: **mọi năng lực mà B cần — B2C IdP, SQL ledger, PSP, container runtime, IaC stateful —
core hiện có ĐÚNG BẰNG KHÔNG.** Làm B không phải "mở rộng cái có sẵn" mà là xây một sản phẩm thứ hai
từ đầu, đặt bên trong ranh giới của sản phẩm thứ nhất.

## Phân tích: B bây giờ khác gì A?

Điểm mấu chốt thường bị hiểu nhầm: **về khối lượng code lõi, B ≈ A + thuế multi-tenant.** Ledger
double-entry, Cognito B2C, PSP adapter, ECS/Aurora, reconcile — hai phương án đều phải xây y hệt.
Game engine của core cũng **không đổi trong cả hai** (nó vẫn gọi 4 callback endpoint; với B, callback
trỏ vào PAM service của chính core). Khác biệt nằm ở phần **bao quanh** code lõi:

### Giá phải trả nếu làm B ngay (4 nhóm)

**① Thuế kỹ thuật multi-tenant — trả NGAY, cho khách hàng CHƯA tồn tại (ước +11–14 tuần, ~x2 plan ADR-0004)**

| Workstream chỉ B mới cần | Ước lượng |
|---|---|
| Data model multi-tenant: `tenant_id` mọi bảng ledger, account-code có chiều tenant, idempotency namespace per-tenant, isolation test (tenant A không bao giờ đọc/ghi được tiền tenant B) | +2–3 tuần |
| Tenant onboarding/config console: chart-of-accounts per tenant, PSP credentials per tenant, KYC policy per tenant, currency per tenant | +3–4 tuần |
| Auth topology per tenant: branding hosted UI, custom domain `auth.<tenant>`, pool topology (pool riêng hay shared + tenant attribute) | +2 tuần |
| Billing/metering cho dịch vụ PAM (tính phí thuê thế nào — per tx? per player?) | +2 tuần |
| Security review/pen-test cấp provider, SLA, docs public cho tenant (như player-sdk docs) | +2–3 tuần |

**② Nghĩa vụ pháp lý/kinh doanh — giá đắt nhất, và KHÔNG phải giá kỹ thuật**

- Giữ tiền **hộ bên thứ ba** → MegaWin từ "game provider" thành "nhà cung cấp nền tảng tài chính":
  nghĩa vụ e-money/trung gian giữ tiền, AML/KYC ở cấp provider (không chỉ cấp operator), PCI-DSS,
  tài khoản phân tách (segregated) per tenant, hợp đồng + trách nhiệm pháp lý khi mất tiền của tenant.
- Nghịch lý giai đoạn đầu: khi tenant #1 là chính mình (cùng pháp nhân), quan hệ "thuê" chỉ là
  **hư cấu kế toán** — lợi ích của B chưa kích hoạt, nhưng nghĩa vụ ở trên thì tính từ ngày ship
  cho tenant thật đầu tiên. Tức là: **chi phí của B là thật ngay bây giờ, lợi ích của B chỉ thật
  khi có tenant #2.**

**③ Blast radius + vận hành**

- Bug ledger/migration trong core = sự cố của **mọi** tenant, kể cả tenant chỉ thuê RGS thuần.
  Phá nguyên tắc "tenant B2B không trả giá cho tính năng họ không dùng" (ADR-0001).
- Đem Postgres + ECS + IaC stateful vào estate core — nơi 11 app đang là Lambda thuần, không
  Docker, không Terraform. Team phải vận hành 2 hệ hình hạ tầng trong cùng một ranh giới sản phẩm,
  on-call cho tiền của người khác.

**④ Chi phí cơ hội**

- Chưa có tenant nào yêu cầu thuê PAM (khảo sát: repo chưa có cả tenant production đầu tiên).
  Mọi giờ công cho ① và ② là đầu tư cho thị trường giả định, trong khi operator — nhu cầu THẬT —
  bị đẩy time-to-market ra xa gấp đôi.

### B "tiện lợi" ở chỗ nào (công bằng mà nói)

1. **Một codebase ví duy nhất** — không có đợt refactor trích xuất về sau.
2. **Dogfood đúng nghĩa sản phẩm thuê**: operator dùng chính thứ sẽ bán, tenant #2 nhận sản phẩm đã
   được vận hành thật bằng tiền thật.
3. **Tài sản bán hàng** nếu chiến lược công ty là turnkey/white-label.
4. Backoffice/tooling hợp nhất một chỗ.

### B có khả thi không?

**Kỹ thuật: có.** Game engine không cần sửa; PAM là sản phẩm cộng thêm nói chuyện qua đúng contract
callback hiện có. Không có rào cản kỹ thuật nào chặn cứng.

**Tổ chức + kinh doanh: chưa.** Với team hiện tại, x2 khối lượng + gánh nghĩa vụ provider tài chính
+ zero khách hàng trả tiền cho phần chênh lệch — B bây giờ là bet sai thời điểm, không phải bet sai
hướng.

## Quyết định

**Giữ phương án A (tái khẳng định ADR-0001). KHÔNG làm B bây giờ. Thiết kế operator SINGLE-TENANT
sạch — không trả trước bất kỳ khoản multi-tenant nào vào schema/code của operator. Thay vào đó,
giữ sẵn một DELTA PLAN (bên dưới) để khi trigger B bật thì lên kế hoạch nhanh.**

Lý do bỏ hướng "ledger multi-tenant-shaped từ ngày đầu" (từng cân nhắc): khi làm B, dịch vụ PAM sẽ có
**DB riêng của nó** (dựng mới cho nhiều tenant) — không dùng chung DB với operator. Vì vậy thêm
`tenant_id`/prefix tenant vào ledger của operator là thuế trả cho một DB sẽ không bao giờ multi-tenant.
Cái kế thừa được cho B là **base**: schema shape, migration tooling, domain logic, use-case — không phải
dữ liệu hay cột thừa.

Các nguyên tắc giữ lại cho operator (✅ = đã ghi vào ADR-0002/0003, cập nhật 2026-07-11):

1. ✅ **DB tách riêng tuyệt đối:** Mongo cluster riêng (`operator-identity`…) + Aurora ledger riêng —
   không dùng chung bất kỳ DB `megawin-*` nào của core. Schema single-tenant, không cột `tenant_id`.
   Code layer (`@megawin/data` pattern, repo, migration tooling) vẫn kế thừa từ core.
   *(ADR-0002 §4, ADR-0003 §2.)*
2. **Domain `operator-wallet` giữ sạch, không import khái niệm operator-specific** — đã có trong
   ADR-0003 §8, nay thành tiêu chí review bắt buộc mỗi PR (lint boundary đã enforce một phần).
   Tương tự cho logic KYC/RG trong `operator-kyc`/`operator-core`: rule engine và state machine
   nhận policy làm input thay vì hardcode. Đây là điều kiện để khi làm B, engine được kế thừa
   nguyên trạng — chỉ policy là per-tenant.
3. ✅ **Config ví đọc từ config object/document** (currency, limits, PSP set) thay vì hằng số rải rác
   trong code — hôm nay 1 bản ghi của operator. *(ADR-0003 §2.)*

### Delta plan — NẾU sau này làm B thì thêm gì (để lên plan nhanh, KHÔNG làm bây giờ)

| # | Hạng mục thêm khi làm B | Ghi chú kế thừa từ operator |
|---|---|---|
| 1 | **DB PAM mới** (Aurora + Mongo riêng của dịch vụ PAM, multi-tenant) | copy schema/migration từ `operator-data-sql`, thêm cột `tenant_id` mọi bảng ledger ngay từ migration đầu của DB mới |
| 2 | Account code thêm chiều tenant: `t:{tenantId}:player:{id}:cash`… | account-code builder trong domain nhận thêm tham số `tenantId` — sửa 1 hàm, không sửa dữ liệu (DB mới, không có dữ liệu cũ) |
| 3 | Idempotency namespace per tenant: UNIQUE `(tenant_id, external_ref)` | đổi constraint trong migration đầu của DB PAM |
| 4 | Bảng `tenant_wallet_configs` (currency, limits, PSP credentials, KYC policy per tenant) | generalize từ config object của operator (mục 3 ở trên) |
| 5 | Invariant `Σ=0` + reconcile chạy per `tenant_id`; isolation test đa tenant | reuse logic reconcile của operator, thêm chiều lặp theo tenant |
| 6 | Tenant onboarding/config console, billing/metering, per-tenant auth branding, SLA + docs public, pen-test cấp provider | phần đắt nhất — chỉ làm khi có tenant thật, yêu cầu thật (xem ①② ở trên) |
| 7 | Migrate operator thành tenant #1 của PAM | operator giữ DB cũ đến khi quyết định chuyển; nếu chuyển: export/import ledger vào DB PAM với account code mới (một lần, có đối soát) |

Ghi chú phạm vi: **KYC tự xây** (upload tài liệu S3+KMS + duyệt tay backoffice + rule engine nội bộ,
không thuê eKYC bên thứ 3 tại VN) — quyết định này càng củng cố nguyên tắc mục 2: KYC engine tự xây
nhận policy làm input chính là một tài sản thuê được của PAM sau này.

## Lý do

- Phần chênh lệch giữa A và B (~11–14 tuần + nghĩa vụ pháp lý provider) phục vụ khách hàng chưa tồn tại,
  trong khi chính repo còn chưa có tenant production đầu tiên.
- Không nhét chiều multi-tenant vào schema/code operator: DB PAM khi làm B là DB **mới**, nên cột
  `tenant_id`/prefix tenant hôm nay là thuế trả cho thứ sẽ không dùng lại. Cái cần bảo toàn là
  **base kế thừa được** (schema shape, migration tooling, domain sạch, engine nhận policy) — đã chốt
  ở 3 nguyên tắc trên, chi phí gần bằng 0.
- Delta plan giữ cửa B mở với chi phí lập kế hoạch tối thiểu: khi trigger bật, bảng delta ở trên là
  khung ước lượng ngay — phần đắt (console, billing, pháp lý provider) **bắt buộc phải chờ tenant thật**
  mới biết yêu cầu đúng (currency? region? KYC market nào?). Xây trước là đoán mò.
- Giữ nguyên lộ trình ADR-0004: operator ship trong ~10 tuần, đồng thời chính là bằng chứng sống
  (case study + số liệu vận hành) để bán PAM sau này — thứ mà làm B trước không tạo ra nhanh hơn.

## Hệ quả

**Tích cực:** time-to-market operator không đổi; schema/code operator đơn giản nhất có thể (không cột
thừa, không tham số thừa); cửa làm B vẫn mở với delta plan sẵn — kế thừa base, không kế thừa nợ;
không gánh nghĩa vụ pháp lý provider khi chưa có doanh thu tương ứng.

**Tiêu cực / chấp nhận:** nếu ngày mai có tenant ký thuê PAM, vẫn cần một đợt productize (~2–3 tháng,
theo delta plan) — nhưng lúc đó có doanh thu cụ thể tài trợ, và yêu cầu thật thay cho phỏng đoán.
Nếu sau này quyết định chuyển operator thành tenant #1 của PAM, cần một lần export/import ledger
(delta plan mục 7) — chấp nhận vì là sự kiện một lần, có đối soát.

## Điều kiện xem xét lại

Giữ nguyên 3 trigger của ADR-0001 (tenant thật ký cam kết / pivot turnkey / chi phí duy trì trùng lặp
vượt ngưỡng), bổ sung:

4. Nếu trong quá trình implement Phase 1–2 (ADR-0004) phát hiện 3 nguyên tắc trên (DB riêng, domain
   sạch, config object) làm tăng >10% effort của phase → đưa lại bàn cân, cắt bớt có chủ đích thay vì
   âm thầm bỏ.
