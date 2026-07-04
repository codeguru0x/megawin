# MegaWin Operator Platform — Design Doc (Brainstorm v0.1)

> **Trạng thái:** Bản brainstorm để team review. Chưa chốt kỹ thuật chi tiết.
> **Mục tiêu:** MegaWin tự vận hành một sản phẩm B2C hoàn chỉnh — có player thật, ví thật,
> nạp/rút, cổng thanh toán, hệ thống đại lý — trên nền 7 game sẵn có, KHÔNG sửa game core.

---

## 1. Bối cảnh & vấn đề

MegaWin hôm nay là **nhà cung cấp game B2B (Game Provider / RGS)**:

- Bán 7 game (keno, lotto535, mega645, power655, max3d, max3dpro, bingo18) cho các **tenant** qua `@megawin/player-sdk`.
- **Tiền của player nằm ở phía tenant.** MegaWin gọi callback (`@megawin/tenant-gateway`) vào API tenant để `debit` khi đặt cược, `credit` khi trả thưởng.
- MegaWin **không** có: ví player, ledger, nạp/rút, cổng thanh toán, frontend player. Chỉ giữ tài chính cấp draw/tenant để báo cáo + tính hoa hồng (`commissionRate` per-tenant).

**Điều muốn xây:** MegaWin đóng vai **operator (nhà vận hành)** — tự có player, ví, nạp/rút, PSP, đại lý bán hàng nhiều tầng. Đây là dịch chuyển từ *Game Provider → Operator (B2C + Affiliate)*.

---

## 2. Quyết định kiến trúc gốc: "Operator-as-a-Tenant"

**Không phải chọn "tenant riêng" (B) hay "sản phẩm operator riêng" (A) — ghép cả hai thành một:**

> Xây một **Operator hoàn chỉnh** (có ví thật, ledger, PSP, đại lý), và Operator đó
> xuất hiện với MegaWin core dưới danh nghĩa **một tenant** (`tenantId = "megawin-play"`).

- **Nhìn từ MegaWin core:** sản phẩm mới chỉ là 1 tenant như bao tenant → **tái dùng 100%** game engine, settle pipeline, `api-player`, `player-sdk`, **không sửa một dòng nào** trong core.
- **Nhìn từ sản phẩm mới:** backend "đóng vai tenant" đó **chính là** nơi chứa Wallet Service, ledger, nạp/rút, PSP, đại lý.

Callback contract của core (`packages/tenant-gateway/src/transaction/types.ts`) đã được thiết kế **product-agnostic**: có `gameId`, `roundIds`, idempotency `tx` (UUIDv7), `force` debit, status-check chống phantom credit. Operator chỉ cần implement đúng contract là plug vào chạy.

**Lợi ích:** `commissionRate` của tenant `megawin-play` chính là **biên lợi nhuận giữ lại của MegaWin** trên sản phẩm của mình → kế toán nội bộ vẫn sạch, dùng đúng báo cáo `DrawTenantFinancial` hiện có.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    MEGAWIN CORE (RGS — GIỮ NGUYÊN)                        │
│   7 game engine · draw · settle workers · api-player · api-tenant         │
└────────────────────────────▲──────────────────────────┬──────────────────┘
                  callback (debit/credit/payout/refund)   │ player-sdk + api-tenant
┌────────────────────────────┴──────────────────────────▼──────────────────┐
│                  MEGAWIN OPERATOR (PAM + WALLET — MỚI)                     │
│   Player Web · Operator Backoffice · Agent Portal · Operator API/BFF       │
└───────────────────────────────────────────────────────────────────────────┘
```

Theo thuật ngữ ngành iGaming: MegaWin core = **RGS/Game Aggregator**; Operator mới = **PAM (Player Account Management) + Wallet**. *"PAM không chạy game; nhưng PAM sập thì sòng bạc ngừng tồn tại"* → Wallet là component được soi kỹ nhất.

---

## 3. Bounded Contexts (14 khối chức năng)

```
NHÓM TÀI CHÍNH (strong consistency — PostgreSQL, ACID)
  1. Wallet & Ledger      — ví thật, double-entry, append-only
  2. Payment / Cashier    — nạp/rút, tích hợp PSP, đối soát
  3. Bonus & Promotion    — ví thưởng, wagering requirement
  4. Agent / Commission   — cây đại lý, hoa hồng (affiliate + tiền mặt)

NHÓM IDENTITY & TUÂN THỦ
  5. Player Identity      — hồ sơ, đăng nhập, map sang Cognito core
  6. KYC / Verification   — eKYC, tài liệu, source-of-funds
  7. Risk / AML / Fraud   — chấm điểm rủi ro, chống đa tài khoản
  8. Responsible Gaming   — giới hạn, tự loại trừ (self-exclusion)

NHÓM VẬN HÀNH & TĂNG TRƯỞNG
  9. Game Catalog / BFF   — proxy player-sdk, quản lý game hiển thị
 10. Notification         — email/SMS/push, OTP
 11. Reporting / BI       — báo cáo tài chính, đối soát, GGR/NGR
 12. Audit / Compliance   — nhật ký bất biến mọi hành động
 13. CMS / Marketing      — banner, khuyến mãi, landing đại lý
 14. Customer Service     — hỗ trợ player đa kênh, AI deflection, ticketing (xem doc riêng ↓)
```

> **Customer Service / Player Support (#14)** có thiết kế chi tiết riêng ở
> [`customer-service-design.md`](./customer-service-design.md): omnichannel (Live Chat, Zalo, Telegram, WhatsApp, Email),
> AI deflection bằng RAG để **tối giản nhân lực**, ticketing, và quy trình nhạy cảm (dispute, self-exclusion) với nguyên
> tắc *CS là interface, không phải enforcement engine*.

**Nguyên tắc consistency:** toàn hệ eventual-consistency, **RIÊNG Wallet phải strong-consistency**. Nhóm tài chính (1-4) dùng PostgreSQL ACID + row-lock; các nhóm khác giao tiếp qua event (SQS/EventBridge).

---

## 4. Tách frontend theo nhóm người dùng

4 nhóm người dùng khác nhau về quyền hạn & surface → tách app:

| App | Người dùng | Workload | Framework (chốt) |
|---|---|---|---|
| **operator-web** (player) | Người chơi cuối | Chơi game real-time, ví, nạp/rút, "My Account"; landing cần SEO | **Next.js 16** |
| **operator-backoffice** | Nhân viên operator | Dashboard nội bộ, bảng nặng, duyệt rút, real-time | **Next.js 16** |
| **agent-portal** | Đại lý/affiliate | Dashboard hoa hồng, link giới thiệu, quản lý cấp dưới | **Next.js 16** |
| CMS/Marketing | Marketing | Landing, khuyến mãi | Gộp vào operator-web / CMS |

**Chốt framework = Next.js 16 cho cả 3 app** (không dùng TanStack Start cho MVP — xem §11 phân tích chi tiết). Lý do ngắn gọn: repo đã chuẩn hoá Next.js 16 + `@megawin/next` + `@megawin/ui` + better-auth + TanStack Query; team chưa từng làm TanStack Start; TanStack Start còn Release Candidate (chưa GA); AI hỗ trợ Next.js tốt hơn hẳn. Reuse tối đa, 1 chuẩn auth/build/lint, implement nhanh cho team ít người.

**KHÔNG** tách "quản lý tài khoản/tín dụng player" thành web riêng. Màn hình "My Account" của player (lịch sử giao dịch, số dư, báo cáo chơi game) nằm **trong `operator-web`** — cùng auth/session/design với phần chơi game. Cái tách ra là **logic + data** (ledger query, báo cáo) đặt ở backend service ổn định, Next.js chỉ là BFF mỏng gọi xuống. Chi tiết ở §11.3.

---

## 5. Wallet & Ledger (trái tim hệ thống)

**Quyết định:** PostgreSQL cho Wallet/Ledger (ACID), MongoDB cho phần còn lại.

Mô hình **ledger-first**: số dư suy ra từ ledger, không update trực tiếp balance.

### Double-entry (bút toán kép)
Mỗi giao dịch tạo ≥2 dòng ledger, tổng = 0. VD player đặt cược 50k:

```
tx=uuidv7 | account: player:123:cash | -50,000  (debit)
tx=uuidv7 | account: house:stake      | +50,000  (credit)
                                         ────────
                                          tổng = 0 ✓
```

### Các loại tài khoản ledger (cần có từ đầu)
- `player:{id}:cash` — tiền thật rút được
- `player:{id}:bonus` — tiền thưởng (có wagering requirement, chưa rút được)
- `player:{id}:locked` — tiền khóa (cược pending, rút đang chờ duyệt)
- `agent:{id}:commission` — ví hoa hồng đại lý
- `agent:{id}:credit` — hạn mức tín dụng đại lý (model đại lý tiền mặt)
- `house:stake` / `house:payout` / `house:deposit` / `house:withdrawal` — tài khoản đối ứng hệ thống
- `psp:{provider}:clearing` — trung gian PSP (tiền đang về/đi)

### Bất biến bắt buộc (rẻ lúc thiết kế, đắt khi sửa sau)
1. Ledger **append-only** — không UPDATE/DELETE; sửa = ghi dòng đảo ngược.
2. **Balance = SUM(ledger)**; có snapshot Redis đọc nhanh nhưng ledger là chân lý.
3. **Idempotency** bằng `tx` (UUIDv7) unique — retry không nhân đôi tiền. Reuse UUIDv7 của core.
4. **Tách authorization ↔ recording** — cho phép/từ chối real-time (balance snapshot + row-lock), ghi ledger qua queue để chịu tải.
5. **Đối soát liên tục 3 nguồn** — ledger Operator ↔ sổ core (nhà cái) ↔ sao kê PSP. Job reconcile hằng ngày; lệch 1 xu = báo động.
6. **Integer VND**, không float.

---

## 6. Quy trình nghiệp vụ chuẩn

### 6.1 Nạp tiền (Deposit) — nhanh, ít ma sát
```
[1] Player chọn số tiền + phương thức → tạo depositIntent (tx=uuidv7, pending)
[2] Hiển thị QR / redirect PSP
[3] Player thanh toán
[4] PSP webhook → Payment Service (NGUỒN CHÂN LÝ, verify chữ ký, check idempotency)
[5] Ghi ledger: psp:clearing → player:cash; cập nhật snapshot
[6] Notify "nạp thành công"
```
**Player thao tác 3 bước.** An toàn: **chỉ cộng tiền khi nhận webhook đã verify chữ ký**, không tin redirect client.

### 6.2 Rút tiền (Withdrawal) — rủi ro AML cao nhất
Nguyên tắc: **KYC verify lúc đăng ký/nạp lần đầu, KHÔNG lúc rút.** Phân tầng rủi ro + tự động hóa luồng chuẩn.

```
[1] Player yêu cầu rút X về tài khoản Y
[2] Khóa tiền ngay: player:cash → player:locked
[3] CHẤM ĐIỂM RỦI RO SONG SONG (không tuần tự):
      ├─ KYC: verified? tài liệu còn hạn? tên khớp chủ tài khoản?
      ├─ AML: sanctions/PEP, ngưỡng báo cáo, source-of-funds nếu > ngưỡng
      ├─ Fraud: đa tài khoản (device/IP), bonus abuse, "nạp rồi rút ngay"
      ├─ Closed-loop: rút về ĐÚNG phương thức đã nạp
      └─ Liquidity: đủ số dư khả dụng hệ thống
[4] HỘI TỤ QUYẾT ĐỊNH theo TẦNG:
      ├─ LOW  → TỰ ĐỘNG DUYỆT (tiền đi ngay)
      ├─ MED  → HÀNG ĐỢI DUYỆT TAY (SLA 4-8h, tự leo thang)
      └─ HIGH → GIỮ + EDD, có thể từ chối
[5a] Duyệt   → PSP payout → ledger player:locked → psp:clearing
[5b] Từ chối → ledger player:locked → player:cash (mở khóa) + lý do rõ ràng
```
**3 tầng: auto / manual / hold-EDD.** Phần lớn giao dịch tài khoản sạch → tầng LOW → tự động.

An toàn quan trọng:
- **Idempotency key theo từng attempt** — retry sang rail khác phải dùng key MỚI (tránh double-payout âm thầm).
- **SLA + auto-escalation** cho hàng đợi duyệt tay.
- **Audit mọi quyết định** (ai duyệt, rule nào, xem dữ liệu gì).

### 6.3 Duyệt & tính tiền thanh toán (human-in-the-loop)
- Hàng đợi ưu tiên theo rủi ro + số tiền.
- Handover giàu ngữ cảnh: hồ sơ player, lịch sử nạp/rút, flag fraud, tài khoản liên quan.
- **Phân quyền theo hạn mức** (maker-checker): staff duyệt tới X, manager tới Y, > Y cần 2 người.
- Không auto-quyết ca AML — bắt buộc con người ký.

### 6.4 Hoa hồng đại lý — tính theo THẮNG-THUA (NGR), KHÔNG theo nạp

| Cơ sở | Rủi ro operator | Khuyến nghị |
|---|---|---|
| Theo nạp (CPA/turnover) | CAO — đại lý dụ nạp-rồi-rút / cày tài khoản ảo | Chỉ dùng CPA cố định lần đầu, có ngưỡng chống lạm dụng |
| **Theo thắng-thua (RevShare/NGR)** | THẤP — đại lý chỉ ăn khi player thua ròng; lợi ích cùng chiều operator | **MẶC ĐỊNH** |

```
GGR = Σ cược − Σ thắng trả ra            (core đã có: profit draw)
NGR = GGR − bonus − phí PSP − chargeback − (thuế nếu có)
Hoa hồng = NGR × commissionRate          (chốt theo kỳ: tuần/tháng)
```

- **Negative carryover bắt buộc:** kỳ NGR âm → hoa hồng = 0 (không âm), số âm **cộng dồn sang kỳ sau**, phải bù hết mới có hoa hồng dương lại. Không có cơ chế này → operator lỗ dài hạn.
- **Multi-tier (giới hạn 1-2 tầng override):** Tier 1 ăn RevShare trên NGR player mình (VD 30%); Tier 2 ăn override trên phần cấp dưới (VD 5-6%). Không đa cấp vô hạn.
- **Đại lý tiền mặt:** thêm lớp **hạn mức tín dụng theo tầng** + settlement giữa các tầng.

### 6.5 Đặt cược & trả thưởng (nối core)
```
ĐẶT CƯỢC (đồng bộ):  api-player → debit callback → Operator: row-lock ví,
                     check balance, ledger player:cash → player:locked/house:stake,
                     trả balance → core tạo vé. (Contract có WAL + status-check.)
TRẢ THƯỞNG (batch):  settle worker → batch payout callback → Operator:
                     ledger house:payout → player:cash (idempotent theo tx), notify.
```

---

## 7. Tech stack đề xuất

| Layer | Công nghệ | Ghi chú |
|---|---|---|
| Player Web | Next.js 16, React 19, Tailwind 4, Radix UI, TanStack Query, `player-sdk` | SEO landing + app + My Account |
| Operator Backoffice / Agent Portal | **Next.js 16** (KHÔNG dùng TanStack Start cho MVP — xem §11.2) | internal tool sau login; Server Actions + TanStack Query/Table |
| Operator API / BFF | Serverless (Lambda + Middy + Zod, như api-player) | stateless, rẻ, co giãn |
| Wallet & Ledger | **Aurora/RDS PostgreSQL** (ACID, row-lock) chạy trên **ECS Fargate/App Runner** (service dài hạn) | trái tim tài chính; tránh connection storm của Lambda (hoặc dùng RDS Proxy) |
| Phần còn lại | MongoDB Atlas (`@megawin/data`) | đồng bộ stack |
| Cache / Lock / Queue | ElastiCache Redis (`@megawin/cache`), SQS + EventBridge, Step Functions | snapshot balance, async payout, orchestrate luồng rút |
| Payment (PSP) | VNPay / MoMo / ZaloPay / VietQR — qua Payment Adapter | VND; chữ ký webhook giữ ở Secrets Manager/KMS |
| Auth player | Cognito core (login qua api-tenant) + session Operator | không dựng lại IdP |
| Đại lý | closure table / materialized path | cây phân cấp |
| KYC/Risk | rule engine + eKYC bên thứ 3 (VNPT eKYC, FPT.AI); tài liệu ở S3+KMS | bắt buộc cho tiền thật |
| Notification | SNS / SES / Pinpoint | email/SMS/push/OTP — không tự dựng |
| Infra | Turborepo (monorepo, deploy độc lập bằng `--filter`), Serverless Framework, AWS | đã có — xem §11.1, §11.4 |

---

## 8. Roadmap giảm rủi ro

- **P0 — Foundation:** đăng ký tenant `megawin-play`; Operator API implement callback contract (`/transaction`, `/transaction/batch`, `/balance`, status); ví + ledger cơ bản (nạp thủ công). → chạy e2e 1 game. Job reconcile core↔operator từ đây.
- **P1 — Player MVP:** operator-web (đăng ký/đăng nhập, chơi 1-2 game, ví, lịch sử); nạp/rút 1 PSP; KYC cơ bản.
- **P2 — Payment & Ops:** thêm PSP, tự động nạp/rút, operator-backoffice (duyệt rút, quản lý player, đối soát).
- **P3 — Affiliate:** link giới thiệu, commission RevShare/NGR, agent-portal.
- **P4 — Đại lý tiền mặt multi-tier:** cây phân cấp, ví đại lý, hạn mức tín dụng, chia hoa hồng theo tầng.
- **P5 — Bonus/Promotion, Risk/Anti-fraud, mở full 7 game.**

> **Customer Service** cài xen theo các phase P1–P4: Help Center + Live Chat từ P1, AI deflection từ P2, đa kênh (Zalo/
> Telegram/WhatsApp) + VIP + RG flow từ P3, Voice/hotline từ P4. Roadmap chi tiết CS-P0→CS-P3 ở
> [`customer-service-design.md`](./customer-service-design.md) §10.

---

## 9. Rủi ro & lưu ý sớm

- **Pháp lý/giấy phép:** giữ tiền player thật + game xổ số chịu quản lý chặt ở VN. Xác định pháp lý TRƯỚC P1.
- **Đối soát tài chính 2-3 sổ:** nơi hay sai nhất. Job reconcile phải có từ P0.
- **Đại lý tiền mặt multi-tier + tín dụng:** phức tạp & rủi ro nhất → đẩy về P4, không nhồi vào MVP.
- **Idempotency payout:** bug double-payout âm thầm, chỉ lộ khi đối soát → test kỹ replay mọi external call.

---

## 10. Điểm còn mở (cần chốt với team)

- ~~Backoffice/Agent dùng TanStack Start ngay hay Next.js trước?~~ → **CHỐT: Next.js 16 cho cả 3 app** (xem §11.2).
- ~~Code trong monorepo hay tách repo?~~ → **CHỐT: ở trong monorepo, deploy độc lập bằng `turbo --filter`** (xem §11.1).
- Operator API: serverless (như core) hay service dài hạn cho wallet? → **khuyến nghị: hybrid** — API/BFF serverless, RIÊNG `wallet-service` là service dài hạn (§11.4). Cần chốt runtime cụ thể (ECS Fargate / App Runner).
- PSP đầu tiên tích hợp là gì? (VNPay/MoMo/VietQR)
- Ngưỡng KYC/AML theo quy định VN cụ thể.
- Tỷ lệ RevShare mặc định + số tầng override tối đa.

---

## 11. Ba quyết định kiến trúc lớn (phân tích để tránh trả giá về sau)

> Ba câu hỏi dưới đây đều là loại "rẻ lúc quyết đúng, đắt khi sửa sau". Ưu tiên xuyên suốt:
> **tối ưu cho team ít người + implement nhanh + tái dùng hạ tầng cloud có sẵn (AWS)**, tránh
> thêm khuôn mẫu/khối lượng học không cần thiết.

### 11.1 Code trong monorepo hay tách repo riêng?

**CHỐT: Ở TRONG monorepo `megawin` hiện tại.** Deploy vẫn độc lập.

Nguyên tắc quan trọng nhất: **monorepo là chiến lược source-control, KHÔNG phải deployment model.**
Ở chung repo *không* có nghĩa deploy chung. Mỗi app/service vẫn build & deploy riêng bằng
`turbo run deploy --filter=<app>...` — CI chỉ build phần bị ảnh hưởng (affected-only).

Vì sao monorepo thắng cho tình huống này (đối chiếu decision framework của ngành — chọn monorepo khi thoả các điều kiện sau):

| Tiêu chí | Trạng thái MegaWin | Kết luận |
|---|---|---|
| Team < 50 người | ✅ team ít người | tooling overhead còn quản được → monorepo OK |
| Chia sẻ code nặng | ✅ Operator dùng `tenant-gateway`, `player-sdk`, `shared`, `data`, `cache`, `audit` | monorepo tránh publish npm chéo |
| Cần atomic cross-service change | ✅ đổi callback contract core → Operator phải đổi cùng lúc | monorepo sửa 1 commit, polyrepo cần 2-3 PR/2-3 repo |
| CI/CD chọn lọc build được | ✅ đã có Turborepo | affected-only build sẵn sàng |

**Trả giá nếu tách repo bây giờ:** phải dựng npm registry nội bộ (CodeArtifact), version bump chéo
mỗi lần contract đổi, mất "go to definition" xuyên package, mất refactor an toàn toàn cục. Với team
ít người → đây là phí tổn giết velocity, không đổi lại lợi ích tương xứng.

**Khi nào MỚI nên tách (hybrid, để dành tương lai):** khi cần **hard security/compliance boundary** cho
ví tiền thật (VD kiểm toán PCI-DSS yêu cầu tách quyền truy cập git, hoặc tách team vận hành tài chính
riêng). Lúc đó **chỉ tách đúng `wallet-service`** sang repo riêng, phần còn lại ở monorepo. Không tách sớm.

**Cấu trúc đề xuất trong monorepo (thêm vào, không sửa core):**

```
apps/
  operator-web/          # Next.js — player (chơi game + My Account + landing SEO)
  operator-backoffice/   # Next.js — nhân viên operator
  agent-portal/          # Next.js — đại lý/affiliate
  operator-api/          # Serverless BFF (Lambda + Middy + Zod, như api-player)
  wallet-service/        # Service dài hạn (ECS Fargate/App Runner) — ví + ledger, DB transaction
  worker-operator-*/     # workers async: payout, reconcile, notification
packages/
  operator-core/         # domain types dùng chung Operator (Money VND, LedgerEntry, ...)
  wallet/                # use-cases ví/ledger (thuần logic, không I/O)
  payment/               # Payment Adapter (PSP-agnostic) + adapters VNPay/MoMo/VietQR
  agent/                 # cây đại lý + commission engine (NGR/RevShare)
```

### 11.2 Có nên thêm TanStack Start? (team chưa từng làm — AI có bù được không?)

**CHỐT: KHÔNG dùng TanStack Start cho MVP. Dùng Next.js 16 cho cả 3 app.**

Ba lý do, xếp theo mức độ quyết định:

1. **Rủi ro sản phẩm giữ tiền thật:** TanStack Start (tính đến 2026) **vẫn ở Release Candidate, chưa GA v1.0**.
   Docs chính thức khuyến cáo *pin exact version* và *coi mỗi version bump là planned work* cho production.
   Sản phẩm này giữ tiền thật của player — không nên gánh thêm rủi ro framework chưa ổn định.

2. **Chi phí "framework thứ hai":** repo đã chuẩn hoá **Next.js 16** cho `backoffice`, đã có sẵn
   `@megawin/next`, `@megawin/ui`, `better-auth`, `@tanstack/react-query`, `@tanstack/react-table`, biome.
   Thêm TanStack Start = nhân đôi khuôn mẫu auth/build/lint/CI, chia đôi kiến thức của team ít người.

3. **"AI ứng dụng vào có nhanh, không cần học không?" — Câu trả lời thẳng: KHÔNG với TanStack Start.**
   AI/LLM **bias sai** về framework này: hay nhầm TanStack Start với TanStack Router, tưởng nó là
   experiment pre-1.0, sinh code theo convention Next.js (`app/page.tsx`) thay vì `createFileRoute`/loaders.
   Nghĩa là AI thường xuyên tạo code sai/lỗi thời → team phải tự sửa → **chậm hơn**, đúng cái ta muốn tránh.
   Ngược lại, **Next.js là framework AI mạnh nhất** (nhiều training data, ổn định). Muốn "AI code nhanh,
   ít phải học" → chọn Next.js. Dùng AI để tăng tốc trên nền công nghệ AI đã thạo, không phải dạy AI thứ nó chưa chắc.

**Kết luận:** dùng Next.js đồng nhất → tối đa reuse, AI hỗ trợ tốt nhất, 1 bộ chuẩn cho team ít người.
Backoffice/agent là internal tool sau login → dùng Next.js (Server Actions + TanStack Query + TanStack Table)
là quá đủ, không cần SEO. Cân nhắc lại TanStack Start **sau P3** khi rảnh tay và nó đã GA — nhưng đó là
"nice to have", không nằm trên đường găng.

### 11.3 Trang "My Account" của player — làm app riêng hay không?

**CHỐT: Tách theo TỐC ĐỘ THAY ĐỔI, không tách theo màn hình.** Trực giác "UI đổi liên tục nên tách khỏi
phần quản lý tài khoản không đổi" là ĐÚNG — nhưng ranh giới đúng là **frontend ↔ domain service**, chứ
không phải "một web quản lý tài khoản riêng".

- **UI "My Account"** (lịch sử giao dịch, số dư, thông tin tài khoản, báo cáo chơi game của player) →
  nằm **trong `operator-web`**, KHÔNG tách app. Đây là màn hình sau-login của chính player, chung
  auth/session/theme/design-system với phần chơi game. Tách ra thành web riêng → 2 lần đăng nhập, 2 design
  system, chia đôi trải nghiệm — phản tác dụng.

- **Logic + data** (query ledger, transaction history, tổng hợp báo cáo) → đặt ở **backend service ổn định**
  (`wallet-service` cho số dư/ledger; `operator-api` BFF cho tổng hợp báo cáo). Next.js chỉ là **BFF mỏng**
  gọi xuống qua một **API contract ổn định**.

**Vì sao cách này "tránh trả giá":** contract ổn định ở giữa cho phép **UI đổi liên tục** (redesign, đổi
layout, A/B test) mà **không đụng** vào logic tài chính. Đúng mong muốn của bạn: cô lập phần hay đổi (UI)
khỏi phần không được đổi (ledger/tài khoản) bằng một lớp API bền vững.

```
┌──────────────── operator-web (Next.js) ─────────────────┐
│  Chơi game  │  Ví/Nạp/Rút  │  MY ACCOUNT (đổi liên tục)  │  ← UI thay đổi thường xuyên
└───────────────────────────┬─────────────────────────────┘
              API contract ổn định (đường ranh giới thật)
┌───────────────────────────▼─────────────────────────────┐
│  operator-api (BFF) → wallet-service (ledger, số dư)     │  ← domain ổn định, ít đổi
│                     → reporting (báo cáo chơi game)       │
└──────────────────────────────────────────────────────────┘
```

Riêng **màn hình quản lý tài khoản do NHÂN VIÊN operator dùng** (KYC, khoá tài khoản, điều chỉnh số dư,
duyệt rút) là nhóm người dùng KHÁC (staff, không phải player) → thuộc `operator-backoffice`, không phải
`operator-web`. Đừng lẫn "My Account của player" với "quản trị player của staff".

### 11.4 Ưu tiên hạ tầng cloud có sẵn (AWS) — dùng managed service, tự viết ít nhất có thể

Nguyên tắc cho team ít người: **mọi thứ không phải lợi thế cạnh tranh → dùng managed service.**
Chỉ tự viết phần lõi khác biệt (wallet/ledger, commission engine).

| Nhu cầu | Managed service (ưu tiên) | Ghi chú |
|---|---|---|
| DB ví/ledger (ACID) | **Amazon Aurora PostgreSQL** (hoặc RDS PostgreSQL) | strong-consistency, row-lock; Aurora Serverless v2 để scale theo tải |
| DB phần còn lại | MongoDB Atlas (`@megawin/data`) | đồng bộ stack hiện tại |
| Cache / lock / balance snapshot | **ElastiCache (Redis)** (`@megawin/cache`) | đã dùng trong core |
| Queue async (payout, reconcile, notify) | **SQS** (+ **EventBridge** cho fan-out event) | tách authorization ↔ recording (§5) |
| Orchestration luồng rút/settle | **Step Functions** | core đã dùng (settle/void ASL) → tái dùng pattern |
| Compute BFF/API | **Lambda + API Gateway** | như `api-player` |
| Compute wallet (cần connection pool + transaction dài) | **ECS Fargate** hoặc **App Runner** | tránh cold-start & connection storm của Lambda lên Postgres; dùng RDS Proxy nếu vẫn muốn Lambda |
| Auth player | **Cognito core** qua `api-tenant` + session Operator | KHÔNG dựng lại IdP |
| eKYC | VNPT eKYC / FPT.AI (3rd-party) | không tự làm nhận diện |
| Bí mật/khoá | **Secrets Manager** + **KMS** | chữ ký PSP webhook, khoá ledger |
| Notification (email/SMS/push/OTP) | **SNS** / **SES** / **Pinpoint** | không tự dựng SMTP |
| File/tài liệu KYC | **S3** (+ mã hoá KMS) | như bucket SDK hiện có |
| Observability | **CloudWatch** + alarm cho job reconcile lệch | báo động lệch 1 xu (§5) |

**Điểm cần lưu ý về compute cho wallet:** Lambda + PostgreSQL dễ gây *connection storm* (mỗi lambda mở 1
connection). Hai lối đi an toàn: (a) `wallet-service` là service dài hạn trên **ECS Fargate/App Runner**
(giữ connection pool, transaction ổn định) — khuyến nghị; hoặc (b) giữ Lambda nhưng bắt buộc **RDS Proxy**
để pool connection. Phần BFF/API stateless còn lại vẫn nên serverless để rẻ và co giãn tốt.

---

## 12. Frontend split, Identity, Onboarding nhanh & Chống lạm dụng bonus

> Ưu tiên xuyên suốt (nhắc lại): **trải nghiệm game sớm/nhanh/dễ nhất cho khách** + **tối ưu team ít người** +
> **chống lạm dụng ngay từ thiết kế** (rẻ lúc thiết kế, cực đắt khi bị rút sạch quỹ marketing sau này).

### 12.1 Game (nhiều sản phẩm, đổi liên tục) vs My Account (cố định) vs Marketing — mix hay tách?

**CHỐT: Một app `operator-web` (Next.js), tách bằng RANH GIỚI BÊN TRONG, không tách thành nhiều web.**

Bản chất 3 loại surface khác nhau về tốc độ thay đổi:

| Surface | Tốc độ đổi | Đặc tính |
|---|---|---|
| **Game lobby + game views** | RẤT NHANH (thêm game, đổi UI, sự kiện) | nhiều sản phẩm, cần lazy-load, A/B test |
| **Marketing / landing / khuyến mãi** | NHANH (chiến dịch theo tuần) | SEO, CMS-driven, ít logic |
| **My Account** (số dư, lịch sử GD, hồ sơ, báo cáo chơi) | CHẬM (ổn định) | đọc từ ledger, cần chính xác tuyệt đối |

Có **HAI kịch bản**, chọn theo tổ chức team thực tế:

**Kịch bản A — Cùng một team/công nghệ (Next.js) làm cả 3:** tách bằng **route group + tải động BÊN TRONG
một app**. Đơn giản nhất, ít hạ tầng, hợp team ít người.

```
apps/operator-web/            # Next.js — 1 app, 1 auth, 1 design system
  app/
    (marketing)/              # route group: landing, khuyến mãi (SEO, static/ISR, CMS-driven)
    (play)/                   # route group: lobby + game views (đổi liên tục)
    (account)/                # route group: My Account (ổn định) — số dư, lịch sử, báo cáo
```

**Kịch bản B — Game do TEAM/CÔNG NGHỆ KHÁC làm (đúng tình huống hiện tại):** tách thành **app độc lập**,
deploy riêng, stack riêng; Next.js là web quản lý tài khoản của bạn. Nhưng player phải **đăng nhập một lần
(SSO)** và dùng chung phiên trên nhiều nơi. → Đây là bài toán SSO cross-app, xem **§13** (kiến trúc chi tiết).

```
game-web (team/công nghệ khác)  ─┐
operator-web / account (Next.js) ─┼─→  cùng SSO qua Operator IdP (Cognito Managed Login)
marketing-web / CMS              ─┘     player đăng nhập 1 lần, dùng ở mọi app
```

Nguyên tắc chung cho cả hai kịch bản:

- **Game views tải động / app game riêng** → thêm/sửa game KHÔNG ảnh hưởng My Account. Tránh barrel import
  (React best-practices §2.1, §2.4).
- **My Account đọc qua BFF ổn định** (§11.3): UI đổi thoải mái, contract xuống `wallet-service` giữ nguyên.
- **Marketing/landing** static/ISR, CMS-driven — SEO tốt, không kéo bundle nặng của game.

> **Vì bạn xác nhận game do team/công nghệ khác làm và muốn SSO dùng nhiều nơi → chọn Kịch bản B.**
> Chi tiết cơ chế "một token / một phiên dùng chung nhiều app" ở §13.

### 12.2 Dùng thẳng Cognito hay cơ chế quản lý tài khoản mới?

**Điểm mấu chốt về Cognito hiện tại:** core dùng Cognito player pool theo mô hình **B2B server-to-server** —
tenant server ký JWT assertion bằng private key, Cognito custom-auth verify JWKS, trả token; player được map
qua `playerExternalId + tenantId`, **không hề có username/password để tự đăng nhập**. Cognito core hiện KHÔNG
làm được: đăng ký bằng email/SĐT, OTP, đăng nhập mạng xã hội, quên mật khẩu — những thứ player B2C cần.

**CHỐT: Kiến trúc identity 2 tầng — KHÔNG dựng lại IdP, cũng KHÔNG ép Cognito core làm việc của B2C.**

```
┌─────────────── TẦNG 1: Operator IdP (MỚI — player B2C tự đăng nhập) ───────────────┐
│  Email/SĐT + password · OTP (SMS/email) · social login · quên mật khẩu · MFA        │
│  → Amazon Cognito (User Pool RIÊNG của operator "megawin-play") — managed, rẻ, sẵn   │
│    hoặc better-auth (đã dùng ở backoffice) nếu muốn kiểm soát sâu hơn                │
└───────────────────────────────────┬─────────────────────────────────────────────────┘
             sau khi player đăng nhập, Operator có playerId nội bộ
┌───────────────────────────────────▼─────────────────────────────────────────────────┐
│  TẦNG 2: map playerId → playerExternalId, gọi api-tenant /player/login (mô hình B2B)  │
│  → nhận Cognito CORE token để chơi game qua player-sdk (GIỮ NGUYÊN core)              │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

- **Tầng 1 = Operator IdP:** đây là "cơ chế quản lý tài khoản mới" cho player thật. Khuyến nghị dùng
  **một Cognito User Pool RIÊNG cho operator** (khác pool core) — vì nó là managed AWS, có sẵn OTP/social/MFA,
  rẻ, khớp ưu tiên "dùng hạ tầng cloud có sẵn". Nếu cần kiểm soát UX/flow sâu hơn (đăng nhập không mật khẩu,
  custom onboarding) thì dùng **better-auth** (đã có trong `backoffice`) trên PostgreSQL. Cả hai đều là managed/known — chọn theo mức độ tuỳ biến cần.
- **Tầng 2 = giữ nguyên B2B:** Operator "đóng vai tenant" (§2), map player nội bộ → `playerExternalId`, gọi
  `api-tenant` để lấy token chơi game. **KHÔNG sửa Cognito core.**

Tại sao KHÔNG chỉ dùng Cognito core cho player B2C: pool core không có luồng self-service B2C, và trộn player
thật của operator vào pool core sẽ phá vỡ mô hình multi-tenant + làm bẩn ranh giới bảo mật. Hai pool tách bạch.

### 12.3 Onboarding NHANH NHẤT — cho khách chơi sớm nhất, xác thực hoãn theo tầng (deferred/progressive KYC)

Đây là chuẩn ngành 2026: **KHÔNG dựng tường KYC trước cửa.** Ép passport trước lần nạp đầu → **40–60% player
đăng ký không bao giờ nạp**. Thay bằng **progressive verification** — mở dần theo ngưỡng rủi ro.

**Mô hình 3 tầng truy cập (áp dụng cho MegaWin):**

```
TIER 0 — Khám phá (0 giây, 0 ma sát)
  → Xem lobby, xem game, chơi thử demo/free. Không cần gì.

TIER 1 — Đăng ký tối thiểu → CHƠI TIỀN THẬT NGAY (mục tiêu < 60 giây)
  → Chỉ email HOẶC số điện thoại + OTP (1 bước). KHÔNG hỏi giấy tờ.
  → Nền tảng chạy screening tự động NGẦM: tuổi/jurisdiction, sanctions/PEP, device/IP.
  → Player nạp lần đầu + chơi ngay. Áp deposit limit tạm cho tới khi verify đủ.

TIER 2 — Trước lần RÚT đầu tiên HOẶC khi chạm ngưỡng nạp lũy kế → KYC tài liệu
  → OCR giấy tờ + liveness selfie (tự động < 30s cho ~85% player).
  → Đây là lúc bắt buộc KYC, KHÔNG phải lúc đăng ký.

TIER 3 — EDD cho player giá trị cao / cờ rủi ro → source-of-funds, review tay.
```

Nguyên tắc thiết kế (ghi rõ để không code sai từ đầu):

- **Tách "eligibility check" khỏi "identity assurance".** Lúc đăng ký chỉ cần đủ điều kiện (tuổi, vùng, không
  trong sanctions) — chưa cần chứng minh danh tính đầy đủ. KYC tài liệu **kích hoạt theo ngưỡng**, không theo lịch.
- **Ngưỡng theo RỦI RO, không theo con số cứng đồng loạt.** Player nạp 100k chơi slot 2 giờ ≠ player nạp 100tr
  ngay session đầu. Trigger KYC theo profile rủi ro.
- **Rút tiền trước khi KYC xong → GIỮ (hold), không từ chối.** Hoàn tất KYC trước "first withdrawal" hoặc trong
  thời hạn quy định. (Chuẩn MGA: KYC hoàn tất trước lần rút đầu, hoặc khi nạp lũy kế chạm ngưỡng trong cửa sổ
  rolling — tuỳ quy định VN sẽ chốt sau, §10.)
- **Screening ngầm, chạy nền** (SNS/SQS + rule engine) — player không thấy độ trễ.

→ Kết quả: khách **chơi tiền thật trong < 1 phút**, compliance chạy nền, chỉ chặn đúng người rủi ro cao ở đúng
thời điểm (lúc rút), không giết conversion.

### 12.4 Khuyến mãi nạp đầu + hoa hồng cao lần đầu + đại lý — VÀ chống lạm dụng

Bạn muốn: **thưởng nạp đầu hấp dẫn, hoa hồng cao cho lần nạp đầu, khuyến khích đại lý kéo khách.** Nhưng đây
CHÍNH LÀ vùng bị lạm dụng nặng nhất: **bonus abuse chiếm ~63.8% toàn bộ gian lận iGaming**; operator châu Âu
mất **10–20% ngân sách marketing** vì nó. Thiết kế sai = quỹ khuyến mãi bị rút sạch âm thầm, chỉ lộ khi đối soát.

**Nguyên tắc vàng (rẻ nhất & hiệu quả nhất): CHẶN BẰNG THIẾT KẾ ĐIỀU KIỆN, trước khi phải dùng model phát hiện.**
"Qualification rules" là control rẻ nhất operator sở hữu vì nó định hình hành vi *trước khi* bonus được cấp.

#### (a) Thiết kế bonus chống lạm dụng ngay từ terms

- **Wagering Requirement (WR):** bonus KHÔNG rút được ngay. Phải cược đủ `WR × bonus` (VD 10×–20×) mới chuyển
  thành tiền thật rút được. → chính là lý do ví `player:{id}:bonus` tách khỏi `player:{id}:cash` (§5): tiền
  thưởng ở ví bonus, chỉ "tốt nghiệp" sang cash khi hoàn thành WR.
- **Game weighting theo RTP:** game RTP cao / biến động thấp đóng góp **thấp hoặc 0%** vào WR. Chặn chiêu "cày
  bonus ở game an toàn rồi rút". (Với xổ số MegaWin: chốt tỷ lệ đóng góp WR theo từng game.)
- **Max bet trong lúc cày WR:** giới hạn cược tối đa khi còn bonus → vô hiệu "technicality trap" (đặt 1 cược lớn
  ăn may rồi rút).
- **Cap theo player VÀ theo hộ (household):** "1 bonus / người / thiết bị / IP / phương thức thanh toán". Ngăn
  multi-accounting.
- **Closed-loop withdrawal:** chỉ rút về ĐÚNG phương thức đã nạp (đã có ở §6.2). Chặn nạp thẻ trộm → rút ví khác.
- **Ngôn ngữ terms rõ ràng, plain-language** — vừa fair với player thật, vừa có cơ sở void bonus khi abuse.

#### (b) "First Deposit Bonus" (FTD) an toàn

- Match bonus lần nạp đầu (VD +100%) NHƯNG: vào ví `bonus` (có WR), có max cap, game weighting, closed-loop,
  và **chỉ mở khoá dần** khi có "verified play" thật (không phải chỉ nạp).
- **Chỉ cấp sau khi qua screening Tier 1** (device/IP/velocity) → chặn ring tạo hàng loạt account ăn FTD.

#### (c) Hoa hồng đại lý "cao lần đầu" — nhưng KHÔNG khuyến khích cày account ảo

Rủi ro lớn nhất của "hoa hồng cao lần đầu nạp" (CPA theo nạp): đại lý **tự tạo/dụ account nạp-rồi-rút** để ăn CPA.
Cân bằng bằng thiết kế lai:

- **Mặc định RevShare theo NGR** (đã chốt §6.4) — đại lý chỉ ăn khi player thua ròng → lợi ích cùng chiều operator.
- **CPA lần đầu (nếu vẫn muốn "hoa hồng cao lần đầu"):** chỉ cố định, có điều kiện chống lạm dụng:
  - Player phải **qua KYC Tier 2** (hoặc đạt ngưỡng cược/nạp thật) → CPA mới "chín" (matured), không trả ngay khi vừa nạp.
  - **Clawback:** nếu player rút sạch/không hoạt động trong X ngày, hoặc bị flag fraud → thu hồi CPA đã trả.
  - **Hold period** cho hoa hồng (VD 7–30 ngày) trước khi đại lý rút được.
- **Negative carryover bắt buộc** (đã có §6.4): kỳ NGR âm → hoa hồng 0, cộng dồn sang kỳ sau.
- **Multi-tier giới hạn 1–2 tầng** (đã có §6.4) — không đa cấp vô hạn.
- **Gắn qualification rules vào MỌI affiliate deal** + phát hiện affiliate fraud (nhiều player cùng device/IP,
  hành vi bonus-only).

#### (d) Phát hiện lạm dụng "nạp-rút liên tục" / bonus-only (tầng 2 — sau thiết kế)

Sau khi đã chặn bằng terms, thêm lớp phát hiện hành vi (chạy nền, cho vào Risk/Fraud §3-nhóm 7):

Các **"chữ ký thợ săn bonus"** cần chấm điểm & cờ:

- Nạp min → cày WR ở game biến động thấp → rút → **không bao giờ quay lại chơi không-khuyến-mãi**.
- Bỏ nền tảng ngay khi WR được áp (đăng ký chỉ để ăn bonus).
- Gameplay tối thiểu nhưng đòi rút ngay lập tức.
- **Multi-accounting / mule ring:** nhiều account trùng device fingerprint / IP / phương thức thanh toán /
  liên kết đại lý.
- "Nạp rồi rút ngay" không chơi thật (money-in money-out).

Tín hiệu đầu vào: **device fingerprint, IP/geo, velocity, betting pattern, identity graph** (liên kết account) →
risk score. Điểm cao → tự động audit / giữ payout / void bonus / chặn chéo (một vi phạm → ban toàn hệ).

**Kiến trúc kỹ thuật gợi ý (dùng hạ tầng có sẵn):**

- Ledger tách `cash`/`bonus`/`locked` (§5) là **nền tảng bắt buộc** — WR chỉ enforce được khi tiền thưởng nằm
  ví riêng, mở khoá dần sang cash.
- Stream sự kiện cược/nạp/rút qua **SQS/EventBridge** → **rule engine** chấm điểm real-time (bắt đầu bằng rule
  cứng đơn giản, thêm ML sau — team ít người không cần ML ngay).
- **Idempotency payout theo từng attempt** (§6.2) — chống double-payout khi retry.
- Job **reconcile hằng ngày** (§5, §9) — lệch 1 xu báo động: cách cuối cùng bắt được abuse âm thầm.

**Tóm tắt cân bằng "nhanh & hào phóng" ↔ "an toàn":** cho onboarding & chơi cực nhanh (Tier 1), bonus/CPA hào
phóng NHƯNG bọc trong WR + game weighting + cap + closed-loop + KYC-gated maturity + clawback + hold. Player
thật gần như không cảm thấy; kẻ lạm dụng bị chặn ngay ở lớp terms trước khi cần đến model phát hiện.

---

## 13. Single Sign-On cho nhiều frontend độc lập (game do team khác làm + web tài khoản Next.js)

> **Yêu cầu của bạn:** game-web (team/công nghệ khác) và account-web (Next.js của bạn) là **hai app độc lập**,
> nhưng player **đăng nhập MỘT LẦN** và phiên dùng chung được ở **nhiều nơi**. Đây là SSO cross-app.
> Ưu tiên: dùng hạ tầng AWS có sẵn (repo đã có better-auth + Cognito Hosted UI), không tự viết IdP.

### 13.1 Nền tảng: repo ĐÃ có sẵn mảnh ghép SSO

`apps/backoffice/src/lib/auth.ts` đang dùng **better-auth + Cognito Hosted UI (OIDC social provider)** với
Authorization Code flow, session HttpOnly cookie. Nghĩa là mô hình **OIDC + BFF** đã chạy thật trong repo.
Ta tái dùng đúng pattern này cho player — chỉ khác User Pool (Operator IdP, §12.2) và mở cho nhiều app.

### 13.2 Cognito Managed Login hỗ trợ SSO native — đây là lời giải "đăng nhập 1 lần, dùng nhiều nơi"

**Cognito hỗ trợ SSO sẵn:** nhiều **app client** trong **cùng một User Pool** → khi player đăng nhập qua
Managed Login lần đầu, Cognito set **session cookie trên user-pool domain**. App thứ 2 (game-web) redirect
sang Managed login → Cognito thấy cookie còn hạn → **trả token luôn, KHÔNG bắt đăng nhập lại**. Đây chính xác là
"single sign-on, dùng nhiều nơi cho player".

```
                     ┌──────────────── Operator IdP: 1 Cognito User Pool ───────────────┐
                     │  Managed Login domain: auth.megawin-play.com                      │
                     │  session cookie SSO (player đăng nhập 1 lần)                       │
                     │  ┌─ app client: account-web ─┐  ┌─ app client: game-web ─┐        │
                     └──┼───────────▲────────────────┼──┼──────────▲─────────────┼───────┘
                        │  OIDC code flow + PKCE      │  │  OIDC code flow (thấy  │
                        │                             │  │  cookie → không login  │
                        │                             │  │  lại)                  │
             ┌──────────┴──────────┐        ┌─────────┴──┴─────────┐
             │ account-web (Next.js)│        │ game-web (team khác) │
             │ BFF: better-auth     │        │ BFF riêng của họ     │
             │ HttpOnly cookie      │        │ HttpOnly cookie      │
             └──────────┬───────────┘        └──────────┬───────────┘
                        │  gọi Operator API/BFF (đính token server-side)
                        ▼                               ▼
             ┌──────────────────── Operator API / wallet-service ───────────────────┐
             │  verify token (Cognito JWKS) → playerId → ledger/số dư/lịch sử        │
             └───────────────────────────────────────────────────────────────────────┘
```

**Lưu ý giới hạn Cognito (đã kiểm chứng):** session cookie SSO của Managed Login **sống 1 giờ, không đổi được**.
Đây là cookie để "đăng nhập lại im lặng giữa các app client", KHÔNG phải session ứng dụng. **Session thật của
từng app do BFF của app đó quản** (HttpOnly cookie, refresh token server-side) — nên vẫn giữ được phiên dài,
1 giờ chỉ là cửa sổ để SSO handshake giữa các app.

### 13.3 Cơ chế "dùng chung auth token" — 3 lựa chọn, xếp theo khuyến nghị

Câu hỏi của bạn: *"cả 2 nơi dùng chung auth token, có API hay cơ chế gì chạy chung không?"* → Có 3 cách. **Không
chia sẻ trực tiếp chuỗi token giữa các app** (anti-pattern XSS). Thay vào đó chia sẻ **danh tính (identity) qua
IdP**, mỗi app tự lấy token của mình.

**① SSO qua IdP (KHUYẾN NGHỊ) — mỗi app tự lấy token, chia sẻ PHIÊN chứ không chia sẻ token.**
- Mỗi app (account-web, game-web) là **OIDC client riêng** trỏ về **cùng Operator User Pool**.
- Player login 1 lần → cookie SSO ở Cognito domain → app nào cũng lấy được token của chính nó, không login lại.
- **Ưu:** chuẩn ngành, an toàn nhất, team game hoàn toàn độc lập stack, chỉ cần biết OIDC. Không lệ thuộc domain.
- **Nhược:** mỗi app cần một BFF nhỏ (nhưng đây là best-practice bắt buộc cho SPA giữ tiền thật).

**② Shared cookie theo parent domain — dùng khi tất cả app cùng một tên miền gốc.**
- account-web = `account.megawin-play.com`, game-web = `game.megawin-play.com`.
- Session cookie set `Domain=.megawin-play.com`, **HttpOnly + Secure** → mọi subdomain đọc được cùng phiên.
- **Ưu:** đơn giản, không handshake OIDC lần 2. **Nhược:** buộc chung parent domain; cần một service phát/refresh
  cookie chung (token broker). Chỉ nên khi các app thực sự chung domain.

**③ Token broker + `postMessage` (micro-frontend nâng cao) — chỉ khi cần nhúng lẫn nhau.**
- Một origin auth riêng (VD `auth.megawin-play.com` / iframe ẩn) giữ refresh token + session; app con xin
  **short-lived access token scoped** qua `postMessage`.
- **Ưu:** cô lập token tối đa. **Nhược:** phức tạp nhất — chỉ dùng khi game-web nhúng account-web (hoặc ngược lại)
  trong iframe. Với team ít người: **để dành**, không làm sớm.

**→ Khuyến nghị: dùng ① (SSO qua Cognito Managed Login).** Đúng "single sign-on, dùng nhiều nơi", tận dụng hạ
tầng có sẵn, để team game độc lập công nghệ. Nếu tiện gom chung parent domain thì bổ sung ② cho mượt.

### 13.4 Quy tắc bảo mật token bắt buộc (SPA giữ tiền thật)

Chuẩn hiện hành (IETF OAuth browser-based apps + BFF pattern):

- **Authorization Code flow + PKCE.** TUYỆT ĐỐI không Implicit flow (lộ token trên URL).
- **BFF pattern:** access/refresh token **giữ SERVER-SIDE**, browser chỉ có **HttpOnly + Secure cookie**. Kể cả
  XSS cũng không "cầm token bỏ chạy" được. Refresh/rotation ở server. `better-auth` (đã có) làm đúng việc này.
- **KHÔNG để token trong `localStorage`** hay cookie non-HttpOnly chia sẻ giữa subdomain.
- **CORS chặt:** BFF chỉ cho credentials từ origin tin cậy (danh sách app đã đăng ký).
- **CSRF protection** trên BFF (better-auth có sẵn).
- **Frontend chỉ gọi BFF của chính nó**; BFF đính token khi gọi xuống Operator API / wallet-service. Frontend
  KHÔNG gọi thẳng resource server bằng token trong JS.

### 13.5 Nối tiếp identity core (B2B) — không mất mạch với §12.2

Sau khi player có phiên SSO ở Operator IdP: BFF/Operator API map `playerId` nội bộ → `playerExternalId`, gọi
`api-tenant /player/login` (mô hình B2B core, §12.2) để lấy **token core chơi game** cho `player-sdk`. Vậy:

- **Player chỉ đăng nhập 1 lần** (Operator IdP) → dùng account-web, game-web, marketing đều không login lại (SSO §13.2).
- **Token core để chơi game** do BFF lấy hộ (server-to-server), player/SPA không thấy — an toàn, đúng mô hình sẵn có.

Tóm lại: **SSO ở tầng Operator IdP (Cognito Managed Login, 1 user pool, nhiều app client)** giải quyết trọn yêu
cầu "đăng nhập một lần, dùng nhiều nơi"; **BFF per-app** giữ token an toàn; **map sang B2B core** giữ nguyên
game engine. Không tự viết IdP, không chia sẻ token thô giữa các app.

---

## Nguồn tham khảo (chuẩn ngành)
- **Customer Service / Player Support** — thiết kế chi tiết ở [`customer-service-design.md`](./customer-service-design.md) (omnichannel, AI deflection/RAG, ticketing, dispute & self-exclusion)
- iGaming Platform Architecture (PAM, Wallet service, DDD boundaries) — Jadex, Born Digital, Spill.media
- Single Source of Truth / ledger-first wallet — urgentgames
- Designing a Payment System (double-entry ledger) — Pragmatic Engineer
- Withdrawal risk tiers / KYC-AML SOP — Blask, deepidv, ideasplusbusiness
- Affiliate commission models (RevShare/NGR, CPA, hybrid, multi-tier) — track360, Scaleo, iRev
- TanStack Start vs Next.js — Vercel, LogRocket, TanStack docs (Start còn Release Candidate, chưa GA v1.0 tính đến 2026)
- Monorepo vs Polyrepo decision framework — Spacelift, ScaledByDesign, Solana Garden ("monorepo là source-control strategy, không phải deployment model")
- AWS managed services cho fintech (Aurora Serverless, RDS Proxy, Step Functions, SQS/EventBridge, Cognito, KMS/Secrets Manager) — AWS docs
- Progressive / deferred KYC & tiered onboarding (Tier 1 chơi ngay, KYC trước rút) — Innosoft, Born Digital, SourceCodeLab, Shufti (MGA ngưỡng EUR 2,000 rolling 180 ngày), NHIMG
- Bonus abuse prevention (63.8% gian lận iGaming; WR + game weighting + max bet + household cap + closed-loop) — Sumsub 2026, Group-IB, Veriff, track360, European Gaming
- Affiliate anti-fraud (CPA clawback, hold period, qualification rules, KYC-gated maturity) — track360, Sumsub
- Identity 2 tầng (Operator IdP B2C ↔ Cognito core B2B) — mô hình player-login core hiện tại (`packages/identity-application`)
- SSO cross-app / BFF pattern cho SPA — IETF `draft-ietf-oauth-browser-based-apps` (Authorization Code + PKCE, BFF), Auth0 BFF pattern, Abblix OIDC+BFF
- Cognito SSO nhiều app client (session cookie SSO 1 giờ, login 1 lần dùng nhiều app) — AWS Cognito Managed Login docs, AWS SaaS multi-tenant Cognito
- Token sharing micro-frontend (token broker + postMessage, shared parent-domain HttpOnly cookie) — OWASP/community best-practice
