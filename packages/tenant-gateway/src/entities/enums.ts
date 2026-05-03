/**
 * Enums cho transaction logging.
 *
 * Giữ tối thiểu — chỉ 2 state `success | failed` cho status và 2 loại event
 * tương ứng 2 API có log (`transaction`, `batch_transaction`).
 */

/**
 * Kết cục 1 transaction — chỉ 2 state.
 *
 * - `Success` = tenant trả `success: true` ở item / single (kể cả `duplicate: true`).
 * - `Failed` = mọi trường hợp còn lại (business reject, outer batch reject,
 *   timeout, network, HTTP 4xx/5xx).
 *
 * Chi tiết lỗi lưu trong object `error` của doc (xem {@link TxLogError}).
 */
export const TxLogStatus = {
  Success: "success",
  Failed: "failed",
} as const;

export type TxLogStatus = (typeof TxLogStatus)[keyof typeof TxLogStatus];

/**
 * Loại API được log.
 *
 * - `Transaction` = single debit/credit qua `POST /transaction`.
 * - `BatchTransaction` = payout/refund qua `POST /transaction/batch`.
 *   Mỗi item trong batch = 1 doc riêng (share `batchId`).
 *
 * `GET /transaction/:tx/status` và `GET /balance` KHÔNG log.
 */
export const TxLogEventType = {
  Transaction: "transaction",
  BatchTransaction: "batch_transaction",
} as const;

export type TxLogEventType = (typeof TxLogEventType)[keyof typeof TxLogEventType];

/**
 * Policy điều khiển việc ghi `tx_logs` — mỗi call site tự chọn theo business
 * context. Tenant-gateway chỉ cung cấp mechanism; policy thuộc về caller.
 *
 * ## Align với `tx_intents` lifecycle
 *
 * `tx_logs` chỉ có giá trị khi system đang **giữ lại trạng thái** của
 * transaction đó (WAL / dispatch order / ticket). Khi system cleanup ngay
 * (ví dụ place-bet debit reject → `safeDeleteWal`) thì log cũng không cần —
 * không còn gì để đối soát hay reconcile.
 *
 * - `Always` — log mọi outcome. **Default.** Dùng cho dispatch (credit/
 *   payout/refund) — outbox pattern luôn giữ state, mọi call cần audit.
 * - `OnSuccessOrUncertain` — skip case system đã cleanup state (business
 *   reject HTTP 200 + `success: false`; HTTP 400 / 401 → `safeDeleteWal`).
 *   Vẫn log success (audit) và uncertainty (timeout, 5xx, network, batch
 *   outer reject → WAL được giữ cho scheduler recovery → cần log để trace +
 *   forensic). Dùng cho place-bet debit.
 * - `Off` — tắt hẳn log. Ít khi dùng, chỉ cho test hoặc call không cần audit.
 *
 * ## Bảng quy tắc `OnSuccessOrUncertain`
 *
 * | Outcome                                  | `httpStatus` | `batchOuterRejected` | Log? |
 * |------------------------------------------|--------------|----------------------|------|
 * | HTTP 200 + `success: true`               | —            | —                    | ✅   |
 * | HTTP 200 + `success: false` (business)   | `undefined`  | `false`              | ❌   |
 * | HTTP 400 / 401 (tenant reject HTTP)      | `400` / `401`| —                    | ❌   |
 * | HTTP 408 / 429 / 5xx (uncertainty)       | `408` / `429`/ `5xx` | —            | ✅   |
 * | Network error                            | `undefined` (code `NETWORK_ERROR`) | — | ✅   |
 * | Batch outer reject                       | —            | `true`               | ✅   |
 */
export const TxLoggingPolicy = {
  Always: "always",
  OnSuccessOrUncertain: "on-success-or-uncertain",
  Off: "off",
} as const;

export type TxLoggingPolicy = (typeof TxLoggingPolicy)[keyof typeof TxLoggingPolicy];
