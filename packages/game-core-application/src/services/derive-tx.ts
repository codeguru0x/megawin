import { v5 as uuidv5 } from "uuid";

/**
 * Namespace UUID cho `deriveTx` — **không đổi giá trị này**.
 *
 * Công thức `deriveTx` là contract: đổi namespace làm mọi key đã phát hành
 * mất tính idempotent (cùng input ra `tx` khác).
 */
export const DERIVE_TX_NAMESPACE = "8f3a2c1e-6b4d-4a91-9e07-2d5c8f1a3b6e";

/**
 * Dẫn xuất `tx` từ idempotency key của client — cùng input luôn cho cùng `tx`.
 *
 * Nhờ đó request trùng đập vào unique index `{tx}` của WAL và bị phát hiện,
 * thay vì tạo giao dịch thứ hai. Dùng UUIDv5 (namespace + name) để kết quả vẫn là
 * UUID hợp lệ — tenant validate format `tx` không bị ảnh hưởng.
 *
 * ⚠️ CÔNG THỨC LÀ CONTRACT: đổi namespace, đổi thứ tự field, hay đổi cách chuẩn hoá
 * sẽ làm MỌI key đã phát hành mất tính idempotent. Có unit test vector cố định canh việc này.
 *
 * Name = `v1|${accountId}|${idempotencyKey}` — prefix version để sau này đổi công thức
 * mà key cũ vẫn resolve đúng. Scope theo `accountId` → player A không thể đoán/chiếm
 * key của player B.
 */
export function deriveTx(accountId: string, idempotencyKey: string): string {
  return uuidv5(`v1|${accountId}|${idempotencyKey}`, DERIVE_TX_NAMESPACE);
}
