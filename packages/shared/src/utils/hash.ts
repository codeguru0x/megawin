/**
 * Hash helpers dùng chung — SHA-256 hex digest cho mục đích KHÔNG bảo mật cao
 * (dedup key, fingerprint, cache key discriminator). KHÔNG dùng để hash password
 * hay bất kỳ dữ liệu cần chống brute-force (dùng HMAC + secret riêng cho trường hợp đó,
 * xem `identity-application/use-cases/players/player-login.ts`).
 */

import { createHash } from "node:crypto";

/**
 * SHA-256 hex digest của 1 chuỗi. Deterministic — cùng input luôn ra cùng output.
 *
 * @example
 * sha256Hex("secret-api-key") // "a1b2c3..." (64 hex chars)
 */
export function sha256Hex(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}
