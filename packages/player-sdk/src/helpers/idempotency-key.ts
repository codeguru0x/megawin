/**
 * Tên header HTTP gửi kèm `placeBet`.
 *
 * Lowercase, prefix `mw-` — không trùng header generic `Idempotency-Key` của ứng dụng khác.
 */
export const IDEMPOTENCY_KEY_HEADER = "mw-idempotency-key" as const;

/**
 * Tạo mã cho một **ý định cược mới**.
 *
 * Gắn vào `placeBet({ idempotencyKey })`. SDK gửi lên header {@link IDEMPOTENCY_KEY_HEADER}.
 * Retry cùng ý định (timeout, mạng đứt) phải **giữ và gửi lại cùng giá trị** —
 * gọi helper lần nữa = mã mới = vé thứ hai.
 *
 * @example
 * ```ts
 * import { createIdempotencyKey, createPlayerClient } from "@megawin/player-sdk";
 *
 * const idempotencyKey = createIdempotencyKey();
 *
 * const result = await client.keno.placeBet({
 *   idempotencyKey,
 *   drawIds: ["2026-03-07.001"],
 *   boards: [{ boardNo: "A", playType: "pick5", numbers: ["01", "15", "33", "44", "60"] }],
 * });
 *
 * // Timeout / mạng đứt — gửi lại CÙNG mã, không gọi createIdempotencyKey() lần nữa
 * await client.keno.placeBet({
 *   idempotencyKey,
 *   drawIds: ["2026-03-07.001"],
 *   boards: [{ boardNo: "A", playType: "pick5", numbers: ["01", "15", "33", "44", "60"] }],
 * });
 * ```
 */
export function createIdempotencyKey(): string {
  return crypto.randomUUID();
}
