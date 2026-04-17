/**
 * Types cho Transaction API — single transaction và batch transaction.
 *
 * MegaWin gọi tenant server qua 2 endpoints:
 * - `POST /transaction` — single (bet debit, rollback credit)
 * - `POST /transaction/batch` — batch (payout, refund nhiều player)
 *
 * Idempotency: mỗi giao dịch có `tx` unique. Tenant nhận cùng `tx` lần 2+
 * phải trả kết quả cũ với `data.duplicate: true`, KHÔNG tạo giao dịch mới.
 *
 * ## Retry semantics — 2 tầng khác nhau
 *
 * **Tầng HTTP:** MegaWin retry khi nhận `502`/`503`/`504` (exponential backoff, max 3 lần).
 * **`500` KHÔNG được retry** (coi là bug permanent).
 *
 * **Tầng business (HTTP 200 + `success: false`):**
 * - Single (place-bet debit): xoá WAL → reject bet → **dừng hẳn, không retry**.
 * - Batch (payout/refund): mark per-item failed → **dispatch loop (Step Function) chủ động
 *   gửi lại cùng `tx`** ở batch tiếp theo (tối đa 10 vòng). Đây là business-level retry.
 *
 * **Rule bắt buộc:** Tenant KHÔNG lưu `INTERNAL_ERROR` vào DB. Dispatch loop gửi lại cùng tx
 * → tenant trả cached error → entry bị reject vĩnh viễn. Khi gặp lỗi nội bộ mà chưa xử lý
 * giao dịch: trả HTTP 502/503 để MegaWin retry ngay ở tầng HTTP.
 *
 * Xem {@link TransactionErrorCode} cho chi tiết error codes.
 *
 * Mọi response theo {@link CallbackResponse} envelope — xem `shared/types.ts`.
 */

import type { TransactionAction, TransactionReason } from "@megawin/shared/types";
import type { Currency } from "@megawin/shared/types";
import type {
  CallbackResponse,
  CallbackErrorInfo,
  TransactionErrorCode,
  TransactionStatusErrorCode,
} from "../shared/types";

// ─────────────────────────────────────────────────────────────────────────────
// Single Transaction — POST /transaction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Payload MegaWin gửi khi thực hiện 1 giao dịch trên ví player.
 *
 * Tenant đọc `action` để biết cộng/trừ tiền, đọc `reason` để ghi audit log.
 * `tx` là idempotency key — tenant PHẢI kiểm tra trùng trước khi xử lý.
 *
 * **Khi nào MegaWin gọi single transaction:**
 * - Player đặt cược: `action: "debit"`, `reason: "bet"`
 * - Bet thất bại cần hoàn: `action: "credit"`, `reason: "rollback"`
 * - Thưởng bonus: `action: "credit"`, `reason: "bonus"`
 * - Điều chỉnh thủ công: `action: "debit" | "credit"`, `reason: "adjustment"`
 * - Thu hồi payout sai: `action: "debit"`, `reason: "adjustment"`, `force: true`
 *
 * @example
 * ```ts
 * // MegaWin gửi khi player đặt cược Keno 3 kỳ
 * const request: TransactionRequest = {
 *   action: "debit",
 *   reason: "bet",
 *   tx: "019078a0-b4c5-7def-8a3b-1c2d3e4f5a6b",
 *   playerId: "john_doe",
 *   amount: 150000,
 *   currency: "VND",
 *   gameId: "keno",
 *   roundIds: ["2026-04-10.095", "2026-04-10.096", "2026-04-10.097"],
 *   description: "Đặt cược Keno 3 kỳ 2026-04-10.095→097",
 * };
 *
 * // MegaWin gửi khi rollback bet lỗi (refTx nằm trong metadata)
 * const rollback: TransactionRequest = {
 *   action: "credit",
 *   reason: "rollback",
 *   tx: "019078a0-c3d4-7abc-9ef0-123456789abc",
 *   playerId: "john_doe",
 *   amount: 150000,
 *   currency: "VND",
 *   gameId: "keno",
 *   roundIds: ["2026-04-10.095", "2026-04-10.096", "2026-04-10.097"],
 *   description: "Hoàn tiền bet lỗi Keno 3 kỳ 2026-04-10.095→097",
 *   metadata: {
 *     refTx: "019078a0-b4c5-7def-8a3b-1c2d3e4f5a6b",
 *   },
 * };
 *
 * // MegaWin thu hồi payout sai — force debit kể cả số dư âm
 * const forceDebit: TransactionRequest = {
 *   action: "debit",
 *   reason: "adjustment",
 *   tx: "019078a0-d5e6-7bcd-af01-234567890def",
 *   playerId: "john_doe",
 *   amount: 1000000,
 *   currency: "VND",
 *   force: true,
 *   gameId: "keno",
 *   description: "Thu hồi payout sai kỳ 2026-04-10.095",
 * };
 * ```
 */
export interface TransactionRequest {
  /**
   * Hành động trên ví player.
   *
   * - `"debit"` — trừ tiền ví player.
   * - `"credit"` — cộng tiền ví player.
   *
   * Tenant chỉ cần 1 `if/else` cho `action`, không cần mapping `reason` → direction.
   */
  action: TransactionAction;

  /**
   * Lý do giao dịch — cho audit trail, không ảnh hưởng logic cộng/trừ.
   *
   * Ví dụ: `"bet"`, `"rollback"`, `"bonus"`, `"adjustment"`.
   * @see {@link TransactionReason} để xem bảng giá trị và mô tả.
   */
  reason: TransactionReason;

  /**
   * Mã giao dịch unique — idempotency key.
   *
   * Format: UUIDv7 (RFC 9562) — opaque, time-ordered, 36 chars.
   * Sinh bởi MegaWin, lưu trong DB, gửi kèm mỗi request.
   *
   * Tenant PHẢI dùng `tx` để kiểm tra trùng lặp:
   * - Nếu `tx` đã xử lý **thành công** → trả `{ success: true, data: { ..., duplicate: true } }`.
   * - Nếu `tx` chưa có trong DB → xử lý fresh.
   *
   * **Quan trọng:** KHÔNG lưu `tx` vào DB khi trả lỗi nội bộ. Nếu lưu,
   * batch dispatch loop gửi lại cùng tx → tenant trả cached error → entry bị reject vĩnh viễn.
   *
   * @example `"019078a0-b4c5-7def-8a3b-1c2d3e4f5a6b"`
   */
  tx: string;

  /**
   * Player ID trong hệ thống tenant — dùng để lookup ví player.
   *
   * Giá trị này là **username lowercase** mà tenant đăng ký khi tạo player
   * trên MegaWin. MegaWin gửi lại đúng giá trị đó trong mỗi callback.
   *
   * Tenant dùng `playerId` để tìm đúng ví player và thực hiện giao dịch.
   *
   * @example `"john_doe"` — lowercase username tenant đã đăng ký.
   */
  playerId: string;

  /**
   * Số tiền giao dịch (VND). Luôn > 0.
   *
   * Direction (cộng/trừ) xác định bởi `action`, không phải dấu của `amount`.
   * Ví dụ: `amount: 50000` + `action: "debit"` = trừ 50.000 VND.
   */
  amount: number;

  /**
   * Mã tiền tệ theo ISO 4217. Hiện tại MegaWin chỉ hỗ trợ `"VND"`.
   *
   * Tenant PHẢI validate currency trước khi xử lý.
   * Nếu không hỗ trợ → trả `error.code: "INVALID_CURRENCY"`.
   *
   * @example `"VND"`
   */
  currency: Currency;

  /**
   * Mã sản phẩm game.
   *
   * Tenant dùng để phân loại giao dịch theo game, hiển thị trên lịch sử
   * giao dịch player, hoặc tạo report theo game.
   *
   * Giá trị hiện tại: `"keno"`, `"lotto535"`, `"mega645"`, `"power655"`,
   * `"max3d"`, `"max3dpro"`, `"bingo18"`.
   * Có thể mở rộng khi MegaWin thêm sản phẩm mới.
   *
   * @example `"keno"`
   */
  gameId?: string;

  /**
   * Danh sách kỳ quay / phiên chơi mà giao dịch này liên quan.
   *
   * Multi-draw bet: 1 lần debit cover nhiều kỳ → tenant index field này
   * cho reporting + reconciliation theo kỳ quay.
   *
   * Semantic tuỳ loại game:
   * - Lottery: drawIds, format `"YYYY-MM-DD.NNN"`.
   * - Casino: spinIds hoặc roundIds.
   * - Sports: matchIds.
   *
   * @example `["2026-04-10.095", "2026-04-10.096", "2026-04-10.097"]`
   */
  roundIds?: string[];

  /**
   * Mô tả giao dịch dạng text — hiển thị cho player trên lịch sử giao dịch.
   *
   * MegaWin gửi tiếng Việt. Tenant có thể dịch hoặc hiển thị trực tiếp.
   *
   * @example `"Đặt cược Keno kỳ 2026-04-10.095"`
   * @example `"Hoàn tiền bet lỗi Keno kỳ 2026-04-10.095"`
   */
  description?: string;

  /**
   * Yêu cầu tenant thực hiện debit bắt buộc — kể cả khi balance < amount (cho phép âm).
   *
   * MegaWin CHỈ gửi `force: true` khi cần thu hồi tiền đã credit sai (payout nhầm).
   * Kịch bản: settle → credit payout 1,000,000 → phát hiện draw result sai →
   * cần debit thu hồi nhưng player đã rút tiền → balance = 0 → `force: true`.
   *
   * **Tenant xử lý:**
   * - `force: true` → trừ tiền KHÔNG check balance → balance có thể âm → trả `success: true`.
   * - `force` không có hoặc `false` → check balance bình thường → `INSUFFICIENT_BALANCE` nếu không đủ.
   *
   * Balance âm = player nợ hệ thống, cần nạp tiền trước khi cược tiếp.
   *
   * @default false
   */
  force?: boolean;

  /**
   * Dữ liệu mở rộng — chứa thông tin game-specific không nằm trong schema chính.
   *
   * Mỗi game/product có thể gửi metadata khác nhau. Tenant có thể lưu hoặc bỏ qua.
   *
   * Các key phổ biến:
   * - `ticketNo` — mã vé hiển thị, VD: `"KENO-20260410-00001"`.
   * - `entryId` — MegaWin entry ID, dùng cho đối soát chi tiết.
   *
   * @example
   * ```ts
   * {
   *   ticketNo: "KENO-20260410-00001",
   *   entryId: "01HXYZ789DEF",
   * }
   * ```
   */
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Single Transaction Response — CallbackResponse<TransactionData>
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dữ liệu trả về khi single transaction thành công.
 *
 * Nằm trong `CallbackResponse.data` khi `success: true`.
 * `duplicate` flag cho phép tenant báo tx đã xử lý trước đó mà vẫn giữ
 * response format đồng nhất — MegaWin xử lý `duplicate: true` tương đương thành công.
 *
 * @example
 * ```ts
 * // Thành công lần đầu
 * { tx: "019078a0-...", balance: 950000, currency: "VND" }
 *
 * // Idempotent — đã xử lý trước đó
 * { tx: "019078a0-...", balance: 950000, currency: "VND", duplicate: true }
 * ```
 */
export interface TransactionData {
  /** Mã giao dịch — echo lại `tx` từ request. */
  tx: string;

  /** Số dư ví player sau giao dịch (VND). Tenant PHẢI trả balance mới nhất. */
  balance: number;

  /** Mã tiền tệ — echo lại currency. @example `"VND"` */
  currency: Currency;

  /**
   * `true` nếu giao dịch đã được xử lý trước đó (idempotent).
   *
   * Tenant trả flag này khi nhận cùng `tx` lần 2+.
   * MegaWin xử lý `duplicate: true` tương đương thành công — không retry, không rollback.
   * Giúp observability: MegaWin log duplicate rate để monitor retry effectiveness.
   */
  duplicate?: boolean;
}

/**
 * Response tenant trả về cho single transaction — theo {@link CallbackResponse} envelope.
 *
 * Generic `TransactionErrorCode` giới hạn `error.code` chỉ nhận các mã lỗi
 * hợp lệ cho transaction API — consumer biết chính xác codes nào cần handle.
 *
 * - `success: true` + `data: TransactionData` → giao dịch OK.
 * - `success: false` + `error: CallbackErrorInfo<TransactionErrorCode>` → thất bại.
 *
 * @example
 * ```ts
 * // Thành công
 * { success: true, data: { tx: "019078a0-...", balance: 950000, currency: "VND" } }
 *
 * // Idempotent — đã xử lý trước đó
 * { success: true, data: { tx: "019078a0-...", balance: 950000, currency: "VND", duplicate: true } }
 *
 * // Thất bại — không đủ số dư
 * { success: false, error: { code: "INSUFFICIENT_BALANCE", message: "Balance 30,000 < bet 50,000 VND" } }
 * ```
 */
export type TransactionResponse = CallbackResponse<TransactionData, TransactionErrorCode>;

// ─────────────────────────────────────────────────────────────────────────────
// Batch Transaction — POST /transaction/batch
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 1 item trong batch transaction — cấu trúc giống {@link TransactionRequest}.
 *
 * Mỗi item là 1 giao dịch độc lập, tenant xử lý từng item riêng.
 * Nếu 1 item fail, các items khác vẫn phải được xử lý (partial success).
 *
 * **Khi nào MegaWin gọi batch:**
 * - Settle kỳ quay → trả thưởng hàng loạt: `action: "credit"`, `reason: "payout"`.
 * - Void kỳ quay → hoàn tiền hàng loạt: `action: "credit"`, `reason: "refund"`.
 *
 * **Batch size:** MegaWin giới hạn tối đa 50 items/batch để tránh timeout.
 * Nếu có nhiều hơn, MegaWin tự chia thành nhiều batch gọi tuần tự.
 *
 * @example
 * ```ts
 * // 1 item trả thưởng Keno
 * const item: BatchTransactionItem = {
 *   action: "credit",
 *   reason: "payout",
 *   tx: "019078a0-b4c5-7def-8a3b-1c2d3e4f5a6b",
 *   playerId: "john_doe",
 *   amount: 200000,
 *   currency: "VND",
 *   gameId: "keno",
 *   roundIds: ["2026-04-10.095"],
 *   description: "Trả thưởng Keno kỳ 2026-04-10.095",
 *   metadata: {
 *     ticketNo: "KENO-20260410-00001",
 *     entryId: "01HXYZ789DEF",
 *   },
 * };
 * ```
 */
export interface BatchTransactionItem {
  /** Hành động trên ví. @see {@link TransactionAction} */
  action: TransactionAction;

  /** Lý do giao dịch. @see {@link TransactionReason} */
  reason: TransactionReason;

  /**
   * Mã giao dịch unique — idempotency key per item.
   *
   * Format: UUIDv7 (RFC 9562) — opaque, time-ordered, 36 chars.
   * Sinh tại settle/void time, lưu trong entry document, đọc lại khi dispatch.
   * Tenant dùng field này để detect duplicate transaction (retry-safe).
   *
   * @example `"019078a0-b4c5-7def-8a3b-1c2d3e4f5a6b"`
   */
  tx: string;

  /** Player ID (lowercase username đã đăng ký trên tenant). @example `"john_doe"` */
  playerId: string;

  /** Số tiền giao dịch (VND). Luôn > 0. */
  amount: number;

  /** Mã tiền tệ ISO 4217. @example `"VND"` */
  currency: Currency;

  /** Mã sản phẩm game. @example `"keno"`, `"lotto535"` */
  gameId?: string;

  /**
   * Danh sách kỳ quay / phiên chơi.
   * @example `["2026-04-10.095"]`
   */
  roundIds?: string[];

  /** Mô tả giao dịch dạng text. @example `"Trả thưởng Keno kỳ 2026-04-10.095"` */
  description?: string;

  /**
   * Yêu cầu tenant thực hiện debit bắt buộc — kể cả khi balance < amount.
   *
   * Cùng semantic với {@link TransactionRequest.force}. MegaWin chỉ gửi `force: true`
   * cho batch khi cần thu hồi payout sai hàng loạt.
   *
   * @default false
   */
  force?: boolean;

  /**
   * Dữ liệu mở rộng game-specific.
   *
   * Các key phổ biến trong batch:
   * - `ticketNo` — mã vé, VD: `"KENO-20260410-00001"`.
   * - `entryId` — MegaWin entry ID cho đối soát.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Payload batch transaction MegaWin gửi cho tenant.
 *
 * Chứa 1 → 50 items. Tenant xử lý từng item độc lập
 * và trả kết quả per item trong {@link BatchTransactionResponse}.
 *
 * @example
 * ```ts
 * const request: BatchTransactionRequest = {
 *   items: [
 *     { action: "credit", reason: "payout", tx: "019078a0-b4c5-7def-8a3b-1c2d3e4f5a6b", ... },
 *     { action: "credit", reason: "payout", tx: "019078a0-b4c5-7def-8a3b-2d3e4f5a6b7c", ... },
 *   ],
 * };
 * ```
 */
export interface BatchTransactionRequest {
  /**
   * Danh sách giao dịch cần xử lý.
   *
   * Tối đa 50 items/batch. Mỗi item là 1 giao dịch độc lập.
   * Tenant PHẢI xử lý tất cả items và trả kết quả cho từng item.
   * Nếu 1 item fail, các items khác vẫn phải xử lý (partial success allowed).
   */
  items: BatchTransactionItem[];
}

/**
 * Kết quả xử lý 1 item trong batch — flat object, không nested envelope.
 *
 * Mỗi item có `success: boolean` riêng — cùng pattern với outer {@link CallbackResponse}.
 * Tenant trả 1 result cho mỗi item trong request.
 * MegaWin đọc `success` để đánh dấu dispatched/failed per entry.
 *
 * @example
 * ```ts
 * // Item thành công
 * { tx: "019078a0-...", success: true, balance: 1200000 }
 *
 * // Item đã xử lý trước đó (idempotent)
 * { tx: "019078a0-...", success: true, balance: 1200000, duplicate: true }
 *
 * // Item thất bại
 * { tx: "019078a0-...", success: false, error: { code: "WALLET_FROZEN", message: "Player wallet frozen" } }
 * ```
 */
export interface BatchTransactionItemResult {
  /** Mã giao dịch — echo lại `tx` từ item tương ứng. */
  tx: string;

  /** `true` = item thành công, `false` = item thất bại. Cùng semantic với outer envelope. */
  success: boolean;

  /**
   * Số dư ví player sau giao dịch (VND).
   *
   * Optional trong batch — tenant có thể không trả balance nếu ảnh hưởng performance.
   * Khi không trả, MegaWin bỏ qua và không cập nhật cached balance.
   */
  balance?: number;

  /**
   * `true` nếu giao dịch đã được xử lý trước đó (idempotent).
   *
   * Chỉ có khi `success: true`. MegaWin xử lý `duplicate: true` tương đương thành công.
   */
  duplicate?: boolean;

  /**
   * Chi tiết lỗi — chỉ có khi `success: false`.
   *
   * Dùng chung {@link CallbackErrorInfo} với generic {@link TransactionErrorCode}
   * — cùng set error codes với single transaction.
   */
  error?: CallbackErrorInfo<TransactionErrorCode>;
}

/**
 * Dữ liệu bên trong outer envelope cho batch response.
 *
 * Nằm trong `CallbackResponse.data` khi `success: true` ở outer level.
 * Outer `success: true` nghĩa là tenant đã **nhận và xử lý** batch request thành công
 * (HTTP level OK). Từng item bên trong có kết quả riêng qua `BatchTransactionItemResult.success`.
 *
 * Pattern: outer envelope = "batch đã xử lý", inner items = "từng tx thành công/thất bại".
 */
export interface BatchTransactionData {
  /**
   * Kết quả per item — cùng thứ tự với `items` trong request.
   *
   * `results.length` PHẢI bằng `items.length` trong request.
   * MegaWin iterate qua results, match theo index với items gốc.
   */
  results: BatchTransactionItemResult[];
}

/**
 * Response tenant trả về cho batch transaction — outer {@link CallbackResponse} envelope.
 *
 * Outer error code dùng {@link TransactionErrorCode} — cùng set với single transaction.
 *
 * - Outer `success: true` + `data.results` → batch đã xử lý, đọc từng item.
 * - Outer `success: false` + `error` → toàn bộ batch thất bại (VD: auth lỗi, invalid payload).
 *
 * @example
 * ```ts
 * // Batch xử lý OK — 1 item thành công, 1 item fail
 * {
 *   success: true,
 *   data: {
 *     results: [
 *       { tx: "019078a0-...", success: true, balance: 1200000 },
 *       { tx: "019078a0-...", success: false, error: { code: "PLAYER_NOT_FOUND", message: "Player not found" } },
 *     ],
 *   },
 * }
 *
 * // Toàn bộ batch thất bại (rare — auth error, malformed payload)
 * { success: false, error: { code: "INTERNAL_ERROR", message: "Database connection timeout" } }
 * ```
 */
export type BatchTransactionResponse = CallbackResponse<BatchTransactionData, TransactionErrorCode>;

// ─────────────────────────────────────────────────────────────────────────────
// Transaction Status Check — GET /transaction/:tx/status
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dữ liệu trả về khi status check thành công (`success: true`).
 *
 * Nằm trong `CallbackResponse.data` khi giao dịch tồn tại và đã xử lý.
 * `processedAt` cho phép MegaWin log timeline chính xác — khi nào tenant thực sự xử lý tx.
 */
export interface TransactionStatusData {
  /**
   * Thời điểm giao dịch được xử lý (ISO 8601).
   *
   * Optional — tenant trả nếu có audit timestamp.
   * MegaWin dùng để log timeline: sent → received → processed.
   *
   * @example `"2026-04-10T07:30:00Z"`
   */
  processedAt?: string;
}

/**
 * Response từ tenant khi MegaWin kiểm tra trạng thái giao dịch — read-only, không side effect.
 *
 * **Endpoint:** `GET /transaction/:tx/status`
 *
 * Error code dùng {@link TransactionStatusErrorCode} — superset của {@link TransactionErrorCode}
 * thêm `"NOT_FOUND"` cho trường hợp tx chưa bao giờ nhận.
 *
 * ## Semantics cốt lõi — `success` là tín hiệu duy nhất scheduler đọc
 *
 * Recovery scheduler **không phân biệt** error code khi nhận `success: false`.
 * Tenant chỉ cần implement đúng 1 rule:
 *
 * - `success: true`  ↔  tiền đã bị trừ khỏi ví player (DB committed).
 * - `success: false` ↔  tiền chưa bị trừ (mọi lý do: NOT_FOUND, business error, ...).
 *
 * Scheduler quyết định:
 * - `success: true` → debit đã xảy ra → kiểm tra ticket exists → markCompleted hoặc rollback credit.
 * - `success: false` → debit chưa xảy ra → xoá WAL, không gửi rollback credit.
 *
 * **Tại sao cần?** Ngăn **phantom credit** — scenario:
 * 1. MegaWin gửi debit → timeout → tenant CHƯA nhận/xử lý.
 * 2. Recovery rollback → gửi credit → tenant cộng tiền cho player.
 * 3. Kết quả: player nhận tiền miễn phí.
 *
 * Với status check: `success: false` → xoá WAL, KHÔNG gửi credit.
 *
 * @example
 * ```ts
 * // Giao dịch đã xử lý thành công — tiền đã bị trừ (DB committed)
 * { success: true, data: { processedAt: "2026-04-10T07:30:00Z" } }
 *
 * // Không tìm thấy — tx chưa bao giờ nhận, hoặc đã nhận nhưng không lưu failure
 * { success: false, error: { code: "NOT_FOUND", message: "Transaction not found" } }
 *
 * // Scheduler xử lý mọi success: false giống nhau → xoá WAL, không rollback
 * ```
 */
export type TransactionStatusResponse = CallbackResponse<
  TransactionStatusData,
  TransactionStatusErrorCode
>;
