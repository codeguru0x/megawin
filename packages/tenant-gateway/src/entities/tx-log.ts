/**
 * Entity + Doc cho transaction log.
 *
 * 1 doc = 1 transaction (single hoặc 1 item trong batch) — **keyed theo `tx`**.
 * Retry cùng `tx` → upsert overwrite doc cũ (xem `TxLogRepository`). Batch N
 * items → N docs share cùng `batchId`.
 *
 * Document chỉ có 9 field top-level, raw payload cho generic.
 */

import type { TransactionErrorCode } from "../shared/types";
import type { TxLogEventType, TxLogStatus } from "./enums";

/**
 * Chi tiết lỗi — CHỈ có khi `status = failed`.
 *
 * Tập trung mọi thông tin debug vào 1 object, tránh optional field rải
 * top-level. Khi `status = success` → field `error` không tồn tại.
 *
 * ## Nguồn lỗi → mapping
 *
 * | Nguồn                      | `code`                 | `httpStatus` | `batchOuterRejected` |
 * |----------------------------|------------------------|--------------|----------------------|
 * | Business reject per-item   | `response.error.code`  | —            | —                    |
 * | Batch outer reject         | `response.error.code`  | —            | `true`               |
 * | HTTP 4xx/5xx               | `"HTTP_<status>"`      | `<status>`   | —                    |
 * | Timeout                    | `"TIMEOUT"`            | `408`        | —                    |
 * | Network (DNS, connrefused) | `"NETWORK_ERROR"`      | `0`          | —                    |
 * | Batch item không có result | `"MISSING_RESULT"`     | —            | —                    |
 */
export interface TxLogError {
  /**
   * Machine-readable code:
   * - Business fail: {@link TransactionErrorCode} (`INSUFFICIENT_BALANCE`, …).
   * - HTTP error: `"HTTP_500"`, `"HTTP_502"`, …
   * - Transport: `"TIMEOUT"`, `"NETWORK_ERROR"`.
   * - Special: `"MISSING_RESULT"`, `"BATCH_REJECTED"`, `"UNKNOWN"`.
   */
  code: TransactionErrorCode | string;

  /** Human-readable message từ tenant hoặc từ exception. Dùng cho debug. */
  message: string;

  /**
   * HTTP status code — chỉ có khi lỗi phát sinh ở HTTP layer.
   * Business fail (HTTP 200 + success: false) KHÔNG có field này.
   */
  httpStatus?: number;

  /**
   * `true` khi lỗi này do tenant reject **toàn bộ batch** ở outer envelope
   * (`BatchTransactionResponse.success = false`). Giúp phân biệt "batch bị
   * reject nên tất cả items failed" vs "item này fail riêng".
   *
   * Single event KHÔNG có field này.
   */
  batchOuterRejected?: boolean;
}

/**
 * Raw MongoDB document — collection `tx_logs` (DB `megawin-tenant`).
 *
 * **1 document = 1 transaction** — keyed theo `tx`. Tra cứu theo `tx` luôn
 * trả đúng 1 record. Retry cùng `tx` → upsert overwrite (chỉ giữ attempt
 * cuối cùng). Batch N items → N docs nhóm qua `batchId`.
 *
 * Payload lưu raw JSON (`Record<string, unknown>`) — generic mọi game/product.
 * Ghi log 1 lần sau khi nhận response / exception → 1 DB call / transaction.
 *
 * ## Scope — khi nào 1 transaction được log
 *
 * `tx_logs` chỉ lưu transaction mà system đang giữ trạng thái (WAL, dispatch
 * order, ticket). Các case system cleanup ngay (place-bet debit business
 * reject / HTTP 4xx → `safeDeleteWal`) KHÔNG được log — align với
 * `tx_intents` lifecycle, tránh flood khi player spam retry.
 *
 * Caller điều khiển qua option `logging` khi gọi `transaction` /
 * `batchTransaction`:
 * - `TxLoggingPolicy.Always` (default) — log mọi outcome. Dispatch, credit, payout dùng.
 * - `TxLoggingPolicy.OnSuccessOrUncertain` — skip business reject + HTTP
 *   400/401. Vẫn log success + uncertainty (timeout/5xx/network/batch outer
 *   reject — WAL được giữ cho scheduler recovery + forensic). Debit dùng.
 * - `TxLoggingPolicy.Off` — tắt hẳn log. Ít khi dùng.
 *
 * ## Trạng thái document (= attempt cuối cùng)
 *
 * - **Success** (`status = success`): có `requestPayload` + `responsePayload`.
 *   KHÔNG có `error`. `responsePayload` đã đủ info (balance, duplicate, …).
 * - **Failed business**: có đủ request + response + `error` (code/message từ tenant).
 *   Chỉ xuất hiện nếu caller dùng `logging: TxLoggingPolicy.Always` (vd dispatch credit).
 * - **Failed outer batch**: `responsePayload` là outer envelope, `error.batchOuterRejected = true`.
 * - **Failed HTTP 4xx/5xx**: có `requestPayload` + `error` với `httpStatus`.
 *   `responsePayload` có thể có (nếu body parse được) hoặc `undefined`.
 * - **Failed timeout / network**: có `requestPayload` + `error` (code `TIMEOUT`/`NETWORK_ERROR`).
 *   KHÔNG có `responsePayload`.
 *
 * ## TTL
 *
 * TTL 90 ngày được apply trực tiếp trên `createdAt` qua MongoDB index
 * `{ createdAt: -1 }` với `expireAfterSeconds = 90 * 86_400`. KHÔNG có
 * field `expiresAt` riêng.
 *
 * `createdAt` được cập nhật **mỗi lần upsert** = thời điểm attempt cuối cùng
 * → TTL đếm từ attempt cuối, giữ record sống lâu hơn khi có retry.
 */
export interface TxLogDoc {
  _id: unknown;

  // ── Event identity ───────────────────────────────────────────────────────
  /** `transaction` (single) hoặc `batch_transaction` (item trong batch). */
  eventType: TxLogEventType;

  /**
   * Idempotency key — UUIDv7.
   * - Single: = `request.tx`.
   * - Batch item: = `item.tx`.
   *
   * Unique index.
   */
  tx: string;

  /**
   * Group key per HTTP call.
   * - Single: = `tx`.
   * - Batch: UUIDv7 mới sinh khi wrap, share cho N items cùng call.
   *
   * Khi "list-by-batch", sort theo `{ tx: 1 }` — `tx` là UUIDv7 time-ordered
   * (48-bit ms timestamp + monotonic counter), đủ deterministic cho mục đích
   * hiển thị. Không cần `batchIndex` riêng.
   */
  batchId: string;

  // ── Routing ──────────────────────────────────────────────────────────────
  /** Tenant ID — partition chính. */
  tenantId: string;

  // ── Request / Response — raw evidence ────────────────────────────────────
  /**
   * Payload gửi đi — lưu **raw JSON string** (kết quả của `JSON.stringify`).
   *
   * Lý do lưu string thay vì nested object:
   * - Tenant response có thể chứa key lạ (`"user.name"`, `"$ref"`) — BSON
   *   **reject** các ký tự `.` và `$` đầu key → insert throw. Lưu string
   *   bypass hoàn toàn ràng buộc này.
   * - Size cap chính xác theo `string.length`, không lệch giữa JSON vs BSON.
   * - Fidelity tuyệt đối cho mục đích đối soát với tenant — đúng byte-for-byte
   *   payload đã gửi / nhận.
   * - Không có nhu cầu query field bên trong payload (filter chỉ theo `tx`,
   *   `batchId`, `status`, `eventType`, `createdAt`).
   *
   * Content per event type:
   * - Single: `TransactionRequest`.
   * - Batch item: `BatchTransactionItem` (phần của item này, KHÔNG phải cả batch).
   *
   * Khi vượt `PAYLOAD_MAX_BYTES`, thay bằng marker JSON hợp lệ
   * `'{"__truncated":true,"__originalSize":N}'` để FE parse không lỗi.
   */
  requestPayload: string;

  /**
   * Response từ tenant — raw JSON string. `undefined` khi không có body.
   *
   * Cùng lý do như `requestPayload`: lưu string để tránh BSON key restriction
   * + giữ fidelity tuyệt đối.
   *
   * Content per tình huống:
   * - Single (HTTP 200): full `TransactionResponse`.
   * - Batch item (outer success): `BatchTransactionItemResult` của item.
   * - Batch outer reject: full `BatchTransactionResponse` (chứa outer error).
   * - Timeout / network error: `undefined`.
   * - HTTP 4xx/5xx: `undefined` (http-client không expose response body khi throw).
   */
  responsePayload?: string;

  // ── Result ───────────────────────────────────────────────────────────────
  /** `success` hoặc `failed`. */
  status: TxLogStatus;

  /**
   * Error details — CHỈ có khi `status = failed`.
   * Tập trung code/message/httpStatus/batchOuterRejected vào 1 object.
   */
  error?: TxLogError;

  // ── Timestamps ───────────────────────────────────────────────────────────
  /**
   * Thời điểm attempt cuối cùng được log (~ thời điểm nhận response / exception).
   *
   * **Upsert semantics:** mỗi lần retry cùng `tx` → `createdAt` cập nhật mới
   * = thời điểm attempt cuối. Không giữ timestamp của attempt đầu tiên.
   *
   * **Đồng thời là TTL anchor** — MongoDB TTL index với `expireAfterSeconds
   * = 90 * 86_400` tự xoá document sau 90 ngày kể từ lần log cuối.
   */
  createdAt: Date;
}

/** Entity sau khi qua mapper — `_id` → `id` string. */
export interface TxLogEntity extends Omit<TxLogDoc, "_id"> {
  id: string;
}

/**
 * Input cho logger — payload nhận raw `unknown` (sẽ tự stringify trong
 * `capPayload`). Tách khỏi `TxLogDoc` để caller không phải tự serialize.
 *
 * Thứ tự xử lý:
 * 1. Caller pass object thô (VD `TransactionRequest`, `BatchTransactionItem`).
 * 2. Logger `capPayload` → `JSON.stringify` + cap size → thành `string`.
 * 3. Insert vào Mongo như `TxLogDoc` với payload đã là string.
 */
export interface TxLogInput extends Omit<TxLogDoc, "_id" | "requestPayload" | "responsePayload"> {
  /** Raw payload — logger tự stringify + cap size trước khi insert. */
  requestPayload: unknown;
  /** Raw payload — `undefined` khi không có response (timeout / network). */
  responsePayload?: unknown;
}
