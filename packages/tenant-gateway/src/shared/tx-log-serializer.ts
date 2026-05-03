/**
 * Pure helpers phục vụ tx-log write-side:
 * - `capPayload` — serialize payload `unknown` → JSON string hợp lệ + cap size.
 * - `buildTxLogInsertDoc` — build insert doc (stamp `createdAt`, serialize payload).
 *
 * Tách riêng khỏi use case để:
 * - Dễ unit test thuần (không mock repo).
 * - Tái sử dụng giữa `LogTxUseCase` và `LogTxBulkUseCase` (bulk share chung
 *   `createdAt` cho cả lô → caller pass vào, không tự stamp).
 */

import type { TxLogInput } from "../entities";
import type { TxLogInsertDoc } from "../infras/repos/types";

/** Giới hạn kích thước payload (tính theo chiều dài JSON string). */
export const PAYLOAD_MAX_BYTES = 100_000;

/**
 * Chiều dài prefix giữ lại khi truncate — đủ để debug các field quan trọng
 * ở đầu JSON (VD header request của tenant). Phải đủ nhỏ so với
 * {@link PAYLOAD_MAX_BYTES} để marker truncate + prefix không vượt cap.
 */
const TRUNCATE_PREFIX_LEN = 8_000;

/**
 * Build insert doc từ logger input — serialize payload + stamp `createdAt`.
 *
 * `createdAt` nhận từ caller (không tự gọi `new Date()`) để bulk insert share
 * chung timestamp → UI sort newest-first giữ đúng thứ tự items trong batch.
 *
 * `responsePayload` chỉ stringify khi caller truyền khác `undefined` — giữ
 * semantics "không có response" rõ ràng (timeout / network error).
 */
export function buildTxLogInsertDoc(
  input: Omit<TxLogInput, "createdAt">,
  createdAt: Date,
): TxLogInsertDoc {
  return {
    eventType: input.eventType,
    tx: input.tx,
    batchId: input.batchId,
    tenantId: input.tenantId,
    requestPayload: capPayload(input.requestPayload),
    responsePayload:
      input.responsePayload !== undefined ? capPayload(input.responsePayload) : undefined,
    status: input.status,
    error: input.error,
    createdAt,
  };
}

/**
 * Serialize payload → JSON string + cap size.
 *
 * Nhận `unknown` để tolerant với mọi shape tenant trả về (kể cả string,
 * number, boolean, null). Luôn trả **string hợp lệ** để BSON insert an toàn
 * và để downstream (FE) có thể `JSON.parse` lại.
 *
 * Edge cases đã handle:
 * - `JSON.stringify(undefined)` trả về `undefined` (không phải string) →
 *   fallback `"null"` để giữ invariant "luôn là JSON hợp lệ".
 * - `JSON.stringify(null)` → `"null"` — OK, không throw.
 * - Circular reference hoặc `BigInt` → throw `TypeError` → fallback marker.
 * - Function / Symbol ở root → `JSON.stringify` trả `undefined` → fallback.
 *
 * Khi size vượt ngưỡng → **giữ prefix** `TRUNCATE_PREFIX_LEN` ký tự đầu
 * (giá trị debug cao: thấy header/field chính) + marker JSON hợp lệ chứa
 * metadata (`__originalSize`, `__preview`). Marker **luôn là JSON hợp lệ**
 * để FE `JSON.parse` thành công.
 */
export function capPayload(payload: unknown): string {
  try {
    const json = JSON.stringify(payload);
    // JSON.stringify trả undefined khi input là undefined / function / symbol.
    // Giữ invariant "trả string JSON hợp lệ" bằng fallback "null".
    if (json === undefined) {
      return "null";
    }

    if (json.length <= PAYLOAD_MAX_BYTES) {
      return json;
    }

    // Truncate: giữ prefix raw string (debug header/key đầu) + metadata.
    // Marker vẫn là JSON hợp lệ (stringify lần 2 sẽ escape quotes trong preview).
    return JSON.stringify({
      __truncated: true,
      __originalSize: json.length,
      __preview: json.slice(0, TRUNCATE_PREFIX_LEN),
    });
  } catch {
    // Circular ref / BigInt / Proxy throw — marker an toàn thay thế.
    return JSON.stringify({ __truncated: true, __unserializable: true });
  }
}
