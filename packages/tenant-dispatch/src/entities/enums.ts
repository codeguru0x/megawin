/**
 * Enums cho Tenant Dispatch — single source of truth trong package này.
 *
 * Pattern `const object + type extraction` — truy cập giá trị qua
 * `DispatchSourceKind.Payout` thay vì string literal `"payout"`.
 * Giống convention `TransactionAction` / `TransactionReason` trong `@megawin/shared/types`.
 */

// ─────────────────────────────────────────────
// Dispatch Source Kind
// ─────────────────────────────────────────────

/**
 * Phân loại nội bộ MegaWin cho mỗi dispatch order — dùng để:
 * - Router policy (retry cap, alert threshold) khác nhau theo loại.
 * - BO filter order theo loại nghiệp vụ.
 * - Builder đóng kín mapping sang `TransactionAction` + `TransactionReason` + `force`.
 *
 * Giai đoạn 1+2 chỉ có 3 loại thực tế:
 *
 * | Key        | Value        | action | reason       | force | Mô tả                                          |
 * |------------|--------------|--------|--------------|-------|------------------------------------------------|
 * | `Payout`   | `"payout"`   | credit | `payout`     | false | Trả thưởng entry sau settle kỳ quay.          |
 * | `Refund`   | `"refund"`   | credit | `refund`     | false | Hoàn lại tiền cược khi huỷ kỳ quay.           |
 * | `Reversal` | `"reversal"` | debit  | `adjustment` | true  | Thu lại tiền trả thưởng đã gửi do sai kết quả (re-settle). `force=true` vì player có thể đã rút tiền → tenant phải cho phép balance âm. |
 */
export const DispatchSourceKind = {
  /** Trả thưởng entry sau settle kỳ quay. */
  Payout: "payout",
  /** Hoàn lại tiền cược khi huỷ kỳ quay (void draw). */
  Refund: "refund",
  /** Thu lại tiền trả thưởng đã gửi do sai kết quả (re-settle). */
  Reversal: "reversal",
} as const;

export type DispatchSourceKind = (typeof DispatchSourceKind)[keyof typeof DispatchSourceKind];

// ─────────────────────────────────────────────
// Dispatch Order Status
// ─────────────────────────────────────────────

/**
 * Trạng thái của 1 dispatch order trong outbox.
 *
 * | Key          | Value          | Mô tả                                                           |
 * |--------------|----------------|-----------------------------------------------------------------|
 * | `Pending`    | `"pending"`    | Chờ worker dispatch. Insert lần đầu luôn ở trạng thái này.      |
 * | `Dispatched` | `"dispatched"` | Tenant đã nhận và xử lý thành công (per-item success=true).     |
 * | `Cancelled`  | `"cancelled"`  | BO huỷ order (chỉ cho phép khi chưa dispatched).                |
 *
 * KHÔNG có status `Failed` — retry là vô hạn cho mọi loại lỗi. Orders fail nhiều lần
 * vẫn giữ `Pending`, chỉ tăng `retryCount`. BO monitor qua `RETRY_ALERT_THRESHOLD` +
 * view "Stuck orders".
 */
export const DispatchOrderStatus = {
  Pending: "pending",
  Dispatched: "dispatched",
  Cancelled: "cancelled",
} as const;

export type DispatchOrderStatus = (typeof DispatchOrderStatus)[keyof typeof DispatchOrderStatus];
