/**
 * Shared types cho MegaWin Tenant Gateway.
 *
 * Định nghĩa các building blocks dùng chung giữa Transaction API, Balance API,
 * và các API callback khác trong tương lai.
 *
 * Tenant implement callback server theo các type này.
 * MegaWin gọi ngược (outbound) vào tenant server qua HTTP.
 *
 * ## Response Pattern — đồng nhất 2 chiều
 *
 * Mọi callback response dùng {@link CallbackResponse} envelope:
 * - `success: true` + `data: TData` — thành công.
 * - `success: false` + `error: CallbackErrorInfo` — thất bại.
 *
 * Pattern này **giống hệt** MegaWin API (`ApiSuccessResponse` / `ApiErrorResponse`
 * trong `@megawin/shared/api-types`) — tenant chỉ cần học 1 mental model cho cả 2 chiều.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Callback Response — Unified envelope cho mọi callback API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Chi tiết lỗi chuẩn — dùng chung cho mọi callback API.
 *
 * `TCode` generic giới hạn error codes hợp lệ per API:
 * - Transaction API → {@link TransactionErrorCode}
 * - Transaction Status API → {@link TransactionStatusErrorCode}
 * - Balance API → {@link BalanceErrorCode}
 *
 * `code` là machine-readable, MegaWin dùng để quyết định flow (retry, reject, escalate).
 * `message` là human-readable, MegaWin log để debug — không hiển thị cho player.
 *
 * @example
 * ```ts
 * { code: "INSUFFICIENT_BALANCE", message: "Player balance 30,000 VND < bet amount 50,000 VND" }
 * ```
 */
export interface CallbackErrorInfo<TCode extends string = string> {
  /**
   * Mã lỗi chuẩn — machine-readable.
   *
   * Giá trị bị giới hạn bởi `TCode` generic — mỗi API quy định rõ set error codes hợp lệ.
   * @see {@link TransactionErrorCode} cho transaction APIs.
   * @see {@link BalanceErrorCode} cho balance API.
   */
  code: TCode;
  /** Mô tả lỗi dạng text — dùng cho logging, không hiển thị cho player. */
  message: string;
}

/**
 * Unified callback response — envelope chung cho **mọi** tenant callback API.
 *
 * Discriminated union qua `success: boolean`:
 * - `success: true` → đọc `data` để lấy kết quả.
 * - `success: false` → đọc `error` để biết lý do thất bại.
 *
 * Pattern đồng nhất với MegaWin API (`ApiSuccessResponse` / `ApiErrorResponse`
 * trong `@megawin/shared/api-types`): tenant implement 1 lần, dùng cho cả
 * callback (Tenant → MegaWin) và consume MegaWin API (MegaWin → Tenant).
 *
 * `TData` — shape data riêng per API (Transaction, Balance, ...).
 * `TCode` — error codes hợp lệ per API, giúp consumer biết chính xác codes nào cần handle.
 *
 * @example
 * ```ts
 * // Thành công — single transaction
 * { success: true, data: { tx: "...", balance: 950000, currency: "VND" } }
 *
 * // Thành công — idempotent (tx đã xử lý trước đó)
 * { success: true, data: { tx: "...", balance: 950000, currency: "VND", duplicate: true } }
 *
 * // Thất bại
 * { success: false, error: { code: "INSUFFICIENT_BALANCE", message: "..." } }
 * ```
 */
export interface CallbackResponse<TData = unknown, TCode extends string = string> {
  /** `true` = thành công, đọc `data`. `false` = thất bại, đọc `error`. */
  success: boolean;

  /** Dữ liệu trả về — chỉ có khi `success: true`. Shape tuỳ từng API. */
  data?: TData;

  /** Chi tiết lỗi — chỉ có khi `success: false`. Error code bị giới hạn bởi `TCode`. */
  error?: CallbackErrorInfo<TCode>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transaction Error Code
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mã lỗi chuẩn tenant trả về khi **giao dịch** (debit/credit/rollback) thất bại.
 *
 * MegaWin dùng error code để quyết định flow tiếp theo:
 * - `InsufficientBalance` → reject, thông báo player nạp thêm.
 * - `PlayerNotFound` → reject, player chưa đăng ký wallet phía tenant.
 * - `WalletFrozen` → reject, tài khoản bị khoá.
 * - `InvalidCurrency` → currency không được hỗ trợ.
 * - `InternalError` → lỗi phía tenant. **Xem quan trọng bên dưới.**
 *
 * ## MegaWin xử lý business errors — tuỳ context
 *
 * Hot path (`place-bet`): MegaWin gửi debit → nhận `success: false` (bất kỳ error code,
 * **kể cả `INTERNAL_ERROR`**) → xoá WAL → reject bet → **dừng hẳn, KHÔNG retry**.
 *
 * Batch (payout/refund): per-item `success: false` → mark entry failed → **dispatch loop
 * (Step Function) chủ động gửi lại cùng `tx`** ở batch tiếp (tối đa 10 vòng).
 * Đây là business-level retry, KHÔNG phải HTTP retry.
 * **QUAN TRỌNG:** Nếu tenant đã lưu error vào DB, dispatch loop gửi lại cùng tx →
 * tenant trả cached error → entry bị reject vĩnh viễn.
 *
 * Scheduler (`recover-orphan-tx-intents`): **KHÔNG re-send debit.** Chỉ chạy khi
 * hot path bị crash/timeout (không nhận được response). Scheduler gọi status check
 * → đọc `success` boolean → quyết định xoá WAL hoặc rollback credit.
 *
 * ## Retry chỉ xảy ra ở tầng HTTP (502/503/504)
 *
 * MegaWin retry khi nhận HTTP `502`, `503`, `504` (exponential backoff, max 3 lần).
 * **`500` KHÔNG được retry** (coi là bug permanent).
 * Tenant muốn MegaWin retry → trả HTTP 502/503 thay vì HTTP 200 + `INTERNAL_ERROR`.
 *
 * ## Quy tắc lưu DB — chỉ 1 rule bắt buộc
 *
 * **KHÔNG lưu `INTERNAL_ERROR` vào DB.** Nếu lưu, lần sau nhận cached error mãi mãi.
 *
 * - **COMPLETED:** Bắt buộc lưu — nền tảng idempotency. Lần sau nhận cùng tx →
 *   cached success + `duplicate: true`.
 *
 * - **Business errors** (INSUFFICIENT_BALANCE, PLAYER_NOT_FOUND, WALLET_FROZEN,
 *   INVALID_CURRENCY): Tuỳ chọn — lưu hoặc không đều hợp lệ.
 *   - Lưu: status check trả cached error → scheduler xoá WAL (cùng kết quả).
 *   - Không lưu: status check trả NOT_FOUND → scheduler xoá WAL (cùng kết quả).
 *   Cả hai đều đúng — scheduler chỉ đọc `success` boolean.
 *
 * - **INTERNAL_ERROR: KHÔNG được lưu.** Nếu lưu → batch dispatch loop gửi lại cùng tx
 *   → tenant trả cached error → entry bị reject vĩnh viễn dù hệ thống đã phục hồi.
 *
 * | Key                  | Value                    | Single (place-bet)       | Batch (payout/refund)          | Lưu DB                   |
 * |----------------------|--------------------------|--------------------------|---------------------------------|--------------------------|
 * | `InsufficientBalance`| `"INSUFFICIENT_BALANCE"` | Huỷ, không retry         | Dispatch loop gửi lại (10 vòng) | Optional                 |
 * | `PlayerNotFound`     | `"PLAYER_NOT_FOUND"`     | Huỷ, không retry         | Dispatch loop gửi lại (10 vòng) | Optional                 |
 * | `WalletFrozen`       | `"WALLET_FROZEN"`        | Huỷ, không retry         | Dispatch loop gửi lại (10 vòng) | Optional                 |
 * | `InvalidCurrency`    | `"INVALID_CURRENCY"`     | Huỷ, không retry         | Dispatch loop gửi lại (10 vòng) | Optional                 |
 * | `InternalError`      | `"INTERNAL_ERROR"`       | Huỷ, không retry         | Dispatch loop gửi lại (10 vòng) | ❌ KHÔNG được lưu        |
 */
export const TransactionErrorCode = {
  /**
   * Số dư không đủ để thực hiện debit.
   *
   * Dùng cho mọi debit khi balance < amount và request KHÔNG có `force: true`.
   * MegaWin nhận error này → reject → dừng, không retry.
   */
  InsufficientBalance: "INSUFFICIENT_BALANCE",
  /** Player không tồn tại trong hệ thống tenant. */
  PlayerNotFound: "PLAYER_NOT_FOUND",
  /** Ví player bị đóng băng / khoá. */
  WalletFrozen: "WALLET_FROZEN",
  /** Loại tiền tệ không hợp lệ. */
  InvalidCurrency: "INVALID_CURRENCY",
  /** Lỗi nội bộ phía tenant. */
  InternalError: "INTERNAL_ERROR",
} as const;

export type TransactionErrorCode = (typeof TransactionErrorCode)[keyof typeof TransactionErrorCode];

// ─────────────────────────────────────────────────────────────────────────────
// Transaction Status Error Code — superset của TransactionErrorCode + NOT_FOUND
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mã lỗi cho Transaction Status Check API (`GET /transaction/:tx/status`).
 *
 * ## Semantics cốt lõi — scheduler đọc `success` boolean, không đọc error code
 *
 * Recovery scheduler của MegaWin **không phân biệt** error code khi nhận `success: false`.
 * Logic scheduler đơn giản như sau:
 *
 * ```
 * success: true  → debit ĐÃ apply vào ví → check ticket → markCompleted hoặc rollback credit
 * success: false → debit CHƯA apply      → xoá WAL, không gửi rollback credit
 * ```
 *
 * **Rule quan trọng nhất:** `success: true` chỉ được trả khi và chỉ khi
 * tiền **đã thực sự bị trừ** khỏi ví player (DB đã commit).
 *
 * ## Khi nào scheduler gọi status check?
 *
 * **Chỉ khi hot path bị crash hoặc timeout** — MegaWin không nhận được response
 * từ tenant (network error, Lambda crash, v.v.). Scheduler KHÔNG re-send debit.
 * Scheduler chỉ check xem debit đã apply chưa để quyết định xoá WAL hay rollback.
 *
 * ## Error code reference
 *
 * - `"NOT_FOUND"` — tx chưa bao giờ nhận, hoặc đã nhận nhưng không lưu.
 * - Business errors (`"INSUFFICIENT_BALANCE"` / `"PLAYER_NOT_FOUND"` /
 *   `"WALLET_FROZEN"` / `"INVALID_CURRENCY"`) — chỉ có nếu tenant lưu failure vào DB.
 *   Nếu không lưu, trả `NOT_FOUND`. Scheduler xử lý giống nhau.
 * - `"INTERNAL_ERROR"` — tenant lỗi hạ tầng **tại thời điểm check**.
 *   Nếu tenant trả HTTP 200 + `success: false` + `INTERNAL_ERROR`, scheduler coi
 *   đây là `success: false` → **xoá WAL**. Tenant muốn scheduler thử lại → trả
 *   HTTP 502/503/504 thay vì HTTP 200.
 *
 * ## Rule duy nhất
 *
 * `success: true` ↔ tiền đã bị trừ (DB committed).
 * `success: false` ↔ tiền chưa bị trừ (mọi lý do).
 */
export type TransactionStatusErrorCode = TransactionErrorCode | "NOT_FOUND";

// ─────────────────────────────────────────────────────────────────────────────
// Balance Error Code
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mã lỗi chuẩn tenant trả về khi query **số dư** thất bại.
 *
 * Balance API đơn giản hơn transaction — có 3 lỗi có thể xảy ra:
 * - `PlayerNotFound` → player chưa đăng ký wallet phía tenant.
 * - `InvalidCurrency` → currency không nằm trong danh sách 2 bên thoả thuận.
 * - `InternalError` → lỗi nội bộ phía tenant. Tenant nên trả HTTP 502/503 thay vì
 *   HTTP 200 + `INTERNAL_ERROR` để MegaWin retry ở tầng HTTP.
 *
 * | Key               | Value                  | MegaWin retry (HTTP 200) | Mô tả                                      |
 * |-------------------|------------------------|--------------------------|---------------------------------------------|
 * | `PlayerNotFound`  | `"PLAYER_NOT_FOUND"`   | Không                    | Player không tồn tại trong hệ thống tenant |
 * | `InvalidCurrency` | `"INVALID_CURRENCY"`   | Không                    | Tiền tệ không nằm trong thoả thuận 2 bên  |
 * | `InternalError`   | `"INTERNAL_ERROR"`     | Không                    | Lỗi nội bộ — nên dùng HTTP 502/503 thay thế |
 */
export const BalanceErrorCode = {
  /** Player không tồn tại trong hệ thống tenant. */
  PlayerNotFound: "PLAYER_NOT_FOUND",
  /** Tiền tệ không nằm trong thoả thuận 2 bên. */
  InvalidCurrency: "INVALID_CURRENCY",
  /** Lỗi nội bộ phía tenant. */
  InternalError: "INTERNAL_ERROR",
} as const;

export type BalanceErrorCode = (typeof BalanceErrorCode)[keyof typeof BalanceErrorCode];

// ─────────────────────────────────────────────────────────────────────────────
// Gateway Config
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cấu hình kết nối tới callback server của tenant.
 *
 * MegaWin lưu config này per tenant trong TenantConfig collection.
 * Mỗi lần gọi callback, factory tạo client từ config tương ứng.
 *
 * @example
 * ```ts
 * const client = createTenantGatewayClient({
 *   callbackBaseUrl: "https://api.tenant.com",
 *   apiKey: "sk_live_abc123",
 *   tenantId: "acme",
 *   timeout: 30_000,
 * });
 * ```
 */
export interface TenantGatewayConfig {
  /**
   * Base URL callback API của tenant.
   *
   * MegaWin append path vào URL này khi gọi.
   * Ví dụ: `"https://api.tenant.com"` → `POST https://api.tenant.com/transaction`
   */
  callbackBaseUrl: string;

  /**
   * API key mà tenant cung cấp cho MegaWin.
   *
   * Gửi qua header `x-api-key` trong mỗi request.
   * Tenant dùng key này để authenticate request từ MegaWin.
   */
  apiKey: string;

  /** Tenant ID — gửi qua header `x-tenant-id`. */
  tenantId: string;

  /**
   * Request timeout (ms). Mặc định: `10_000` (10 giây).
   *
   * Nên set 30_000 cho batch operations vì tenant cần xử lý nhiều items.
   * Nếu timeout, MegaWin sẽ retry ở tầng HTTP nếu status code retryable (502/503/504).
   */
  timeout?: number;
}
