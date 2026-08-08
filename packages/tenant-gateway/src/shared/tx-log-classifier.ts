/**
 * Phân loại kết cục 1 transaction → `ClassifiedOutcome` (status + optional error).
 *
 * 3 tình huống classify:
 * 1. `classifyItem(item)` — HTTP 200 nhận được response per-item.
 * 2. `classifyBatchOuterReject(outerError)` — HTTP 200 nhưng outer
 *    `BatchTransactionResponse.success = false`.
 * 3. `classifyThrown(err)` — exception từ HttpClient (timeout / network / HTTP 4xx/5xx).
 *
 * Mục tiêu: sinh error object ngắn gọn đủ để debug (`code`, `message`,
 * optional `httpStatus`, `batchOuterRejected`). KHÔNG parse response body
 * vì `ApiClientError` của `@megawin/http-client` không expose body — exception
 * path caller luôn log `responsePayload = undefined`.
 */

import { ApiClientError } from "@megawin/http-client";
import { TxLogStatus } from "../entities/enums";
import type { TxLogError } from "../entities/tx-log";

/**
 * Kết quả phân loại — feed thẳng vào `TxLogInput`:
 * - `status = success` → KHÔNG có `error`.
 * - `status = failed` → có `error` với đủ code/message.
 */
export interface ClassifiedOutcome {
  status: TxLogStatus;
  error?: TxLogError;
}

/**
 * Item result feed vào classifier — discriminated union theo `success`:
 * - `success: true` → KHÔNG cần `error`.
 * - `success: false` → có `error` (fallback tenant thiếu → `UNKNOWN`).
 *
 * Union discriminant giúp compiler bắt misuse (VD pass `success:true` kèm
 * `error` là bug → error chưa chắc có nghĩa gì).
 */
export type ItemClassifyInput = { success: true } | { success: false; error?: { code: string; message: string } };

/**
 * Classify 1 item result (single transaction hoặc batch item).
 *
 * - `success = true` → `Success` (kể cả `duplicate: true` — idempotent replay
 *   vẫn coi là thành công).
 * - `success = false` → `Failed` + error từ response. Khi tenant trả envelope
 *   thiếu field `error` → fallback `code = "UNKNOWN"`.
 */
export function classifyItem(item: ItemClassifyInput): ClassifiedOutcome {
  if (item.success) {
    return { status: TxLogStatus.Success };
  }

  return {
    status: TxLogStatus.Failed,
    error: {
      code: item.error?.code ?? "UNKNOWN",
      message: item.error?.message ?? "",
    },
  };
}

/**
 * Classify outer batch reject (`BatchTransactionResponse.success = false`).
 *
 * Đánh dấu `batchOuterRejected: true` để UI phân biệt với item-level business
 * fail (giúp debug: "cả batch bị từ chối" vs "chỉ mình item này fail").
 */
export function classifyBatchOuterReject(outerError?: { code: string; message: string }): ClassifiedOutcome {
  return {
    status: TxLogStatus.Failed,
    error: {
      code: outerError?.code ?? "BATCH_REJECTED",
      message: outerError?.message ?? "",
      batchOuterRejected: true,
    },
  };
}

/**
 * Classify exception throw từ HttpClient với `rawResponse: true`.
 *
 * Theo implementation của `@megawin/http-client`:
 * - Timeout: `ApiClientError(408, { code: "TIMEOUT" })`.
 * - Network (DNS, ECONNREFUSED, abort): `ApiClientError(0, { code: "NETWORK_ERROR" })`.
 * - HTTP 4xx/5xx sau retry: `ApiClientError(status, { code: "NETWORK_ERROR" })`.
 * - Non-ApiClientError (rất hiếm): fallback `NETWORK_ERROR` + `err.message`.
 *
 * `ApiClientError` không expose response body — caller lưu
 * `responsePayload = undefined` khi log exception path, không cần hàm này trả.
 *
 * Quy tắc ưu tiên code + `httpStatus`:
 * 1. `TIMEOUT` → code giữ nguyên, `httpStatus = 408` (http-client set khi abort).
 * 2. `status > 0` → `HTTP_<status>` + `httpStatus = status`.
 * 3. `status <= 0` (network failure) → `NETWORK_ERROR`, **KHÔNG** ghi `httpStatus`
 *    (giá trị `0` không có ý nghĩa audit — `code = NETWORK_ERROR` đã nói đủ).
 */
export function classifyThrown(err: unknown): ClassifiedOutcome {
  if (err instanceof ApiClientError) {
    const { status, code, message } = err;

    if (code === "TIMEOUT") {
      return {
        status: TxLogStatus.Failed,
        error: { code: "TIMEOUT", message, httpStatus: status > 0 ? status : 408 },
      };
    }

    if (status > 0) {
      return {
        status: TxLogStatus.Failed,
        error: { code: `HTTP_${status}`, message, httpStatus: status },
      };
    }

    return {
      status: TxLogStatus.Failed,
      error: { code: "NETWORK_ERROR", message },
    };
  }

  const message = err instanceof Error ? err.message : String(err);
  return {
    status: TxLogStatus.Failed,
    error: { code: "NETWORK_ERROR", message },
  };
}
