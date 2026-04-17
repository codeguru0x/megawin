import { v7 as uuidv7, v4 as uuidv4 } from "uuid";
import { ulid } from "ulid";

/**
 * Tạo ULID mới — monotonic, sortable, 26 chars Crockford Base32.
 *
 * Dùng cho: account ID, entity ID nội bộ.
 * Giữ lại để backward-compatible với các ID đã sinh trước đó.
 */
export const generateULID = (): string => {
  return ulid();
};

/**
 * Tạo unique ID mới dùng UUIDv7 (RFC 9562).
 *
 * Cấu trúc: 48-bit Unix timestamp (ms) + 32-bit monotonic sequence + random.
 * Time-ordered, sortable, opaque — 36 chars standard UUID format.
 *
 * An toàn sinh hàng triệu ID / giây / process nhờ monotonic counter.
 * Zero collision trong single process; xác suất gần zero across processes.
 *
 * Dùng cho: transaction ID (tx), external-facing ID, mọi trường hợp cần
 * opaque + sortable + idempotency key. Đây là **default choice** cho ID mới.
 *
 * @example
 * ```ts
 * import { generateId } from "@megawin/shared/utils";
 *
 * const txId = generateId();
 * // "019078a0-b4c5-7def-8a3b-1c2d3e4f5a6b"
 * ```
 */
export const generateId = (): string => uuidv7();

/**
 * Tạo random ID dùng UUIDv4 (RFC 9562).
 *
 * Pure random 122-bit, không sortable, không chứa timestamp.
 * Dùng cho: session token, nonce, trường hợp cần maximum entropy
 * và không cần time-ordering.
 *
 * @example
 * ```ts
 * import { generateRandomId } from "@megawin/shared/utils";
 *
 * const sessionId = generateRandomId();
 * // "110e8400-e29b-41d4-a716-446655440000"
 * ```
 */
export const generateRandomId = (): string => uuidv4();
