# ADR-0001: Wallet/PAM thuộc Operator, không đưa vào MegaWin core

- **Status:** Accepted
- **Ngày:** 2026-07-05
- **Người quyết định:** Kiến trúc MegaWin Operator
- **Liên quan:** [`operator-platform-design.md`](../operator-platform-design.md) §11, rule `.cursor/rules/operator-monorepo-structure.mdc`, `packages/tenant-gateway/callback-api-guide.md`

---

## Bối cảnh

MegaWin core là **RGS thuần** (Remote Game Server): nó xử lý cược/kết quả/settle, nhưng **không giữ tiền
người chơi**. Contract callback (`packages/tenant-gateway/callback-api-guide.md`) khẳng định rõ:

> "Tenant là đối tác phân phối, **tự quản lý wallet/balance** của player. MegaWin gọi ngược (callback) vào
> API của tenant để thực hiện các thao tác trên ví player."

Toàn bộ cơ chế phức tạp của core — idempotency `tx` (UUIDv7), WAL, recovery scheduler, dispatch loop,
phantom-credit prevention, `force` debit — tồn tại để **nói chuyện với một ví ở NƠI KHÁC** (phía tenant).
Core được thiết kế **có chủ đích để không sở hữu ledger**.

MegaWin Operator (product B2C) thì **cần ví thật**: nạp/rút, double-entry ledger, số dư, KYC, nạp qua PSP.

Câu hỏi đặt ra: **có nên xây Wallet/PAM (Player Account Management) ngay trong core để operator dùng lại, và
sau này cho tenant thuê không** — giống một số game provider bán "turnkey/white-label" kèm giải pháp player?

Ràng buộc thực tế tại thời điểm quyết định:
- **Chưa có tenant nào** yêu cầu thuê giải pháp player/ví. Chỉ operator cần.
- Core dùng **MongoDB** (`@megawin/data`). Wallet cần **ACID/Postgres**.
- Ledger tiền thật là thành phần **rủi ro cao nhất** hệ thống (tài chính + pháp lý).

## Các phương án đã cân nhắc

- **A. Tách riêng:** ví ở `operator-wallet`, operator là 1 tenant của core (implement 4 callback endpoint).
- **B. PAM-as-a-Service ở core:** xây ví multi-tenant trong core, bán cho tenant, operator là 1 khách hàng.
- **C. Shared package, không bán:** core có reference wallet dùng chung qua package, không expose thành service.

## Quyết định

**Chọn A, áp dụng kỷ luật thiết kế của C. KHÔNG làm B ở thời điểm hiện tại.**

Cụ thể:

1. Ví sống ở `operator-wallet` / `operator-wallet-application` (Postgres qua `operator-data-sql`). **Core giữ
   nguyên RGS-pure.** Operator đóng vai **một tenant đặc biệt** (`operator-as-a-tenant`) — implement đúng 4
   callback endpoint như mọi tenant. Đây là cách **dogfood** chính contract callback của core.
2. Thiết kế `operator-wallet` **sạch để trích xuất được về sau** (kỷ luật C): domain ledger thuần, không
   phụ thuộc khái niệm "operator" trong core-logic; PSP/KYC là adapter thay thế được.
3. **Không** đưa Postgres/tiền thật vào core service. Enforce bằng `dependency-cruiser` (core không import
   `@megawin/operator-*`).
4. **Để dành tên trần `wallet`** (rule §4): nếu tương lai có tenant thật thuê PAM, trích core-logic của
   `operator-wallet` ra sản phẩm B2B `wallet` — **refactor có chủ đích, không viết lại từ đầu**.

## Lý do

- **YAGNI + nhu cầu thực:** chưa tenant nào cần → làm B là xây tài sản đắt đỏ cho thị trường giả định. A phục
  vụ đúng nhu cầu operator, time-to-market nhanh nhất.
- **Giữ core RGS-pure:** đưa ví vào core = **thay đổi bản chất sản phẩm** từ "game provider" sang "nhà cung
  cấp nền tảng tài chính", kéo theo nghĩa vụ **giữ tiền / e-money license / AML/KYC cấp provider / PCI-DSS /
  đối soát ngân hàng**. Đó là quyết định KINH DOANH, không phải kỹ thuật — và hiện chưa có động lực doanh thu.
- **Blast radius:** ledger là thành phần rủi ro cao nhất. Nằm trong core = một bug ledger/migration ảnh hưởng
  **mọi tenant**, kể cả tenant chỉ muốn RGS thuần. Cô lập trong operator giữ nguyên tắc "tenant B2B không trả
  giá cho tính năng B2C họ không dùng".
- **Đồng nhất hạ tầng:** core Mongo; nhét Postgres + transaction dài vào runtime Lambda game làm nặng bundle
  và cold-start (trái Vercel bundle rule). A/C giữ Postgres cô lập trong nhánh operator.
- **"Dùng lại" nằm ở tầng CODE, không phải SERVICE:** cái operator tái dùng từ core là **type/protocol của
  `tenant-gateway`** (action/reason/tx/idempotency), `@megawin/audit`, shared utils — chứ không phải "một ví
  có sẵn". A/C đã cho phép điều này.

## Hệ quả

**Tích cực:**
- Core không đổi bản chất, không gánh rủi ro tài chính/pháp lý.
- Operator ship nhanh; đồng thời kiểm chứng (dogfood) contract callback.
- Vẫn giữ được quyền chọn B sau này (tên + layering đã để dành) mà không trả giá bây giờ.

**Tiêu cực / cần lưu ý:**
- Operator phải tự vận hành ledger + đối soát core↔operator↔PSP (đã có `operator-worker-reconcile`).
- Nếu tương lai làm B, cần một đợt refactor trích xuất `operator-wallet` → `wallet` (đã lường trước, không
  phải rào cản kỹ thuật vì layering đã sạch).

## Điều kiện xem xét lại (revisit triggers)

Mở lại quyết định (cân nhắc B) khi **một trong các điều sau** xảy ra:
1. Có **≥1 tenant thật** ký cam kết thuê giải pháp player/ví (có doanh thu cụ thể).
2. MegaWin quyết định pivot chiến lược sang **turnkey/white-label platform**.
3. Chi phí duy trì ví trùng lặp giữa operator và (giả định) tenant vượt chi phí xây multi-tenant một lần.
