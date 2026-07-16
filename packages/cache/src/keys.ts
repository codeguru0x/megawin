/**
 * Key convention helpers cho toàn hệ thống cache.
 *
 * Format chuẩn: `{namespace}:{entity}:{version}[:{discriminator}]`
 * - namespace     : gameKey hoặc domain — `keno`, `identity`, `tenant-gw`
 * - entity        : tên dữ liệu — `global-config`, `tenant-config`
 * - version       : `v{n}` — bump khi đổi shape để tránh deserialize sai sau deploy
 * - discriminator : id cụ thể (nếu có) — `{tenantId}`, `{drawId}`
 *
 * VD: `keno:tenant-config:v1:tenant_abc`
 *
 * ⚠️ KHÔNG đặt secret (raw apiKey…) vào key — key xuất hiện trong log/monitoring
 * Redis. Hash trước bằng `hashKeyPart()`.
 */

import { sha256Hex } from "@megawin/shared/utils";

/**
 * Ghép các phần TĨNH thành cache key prefix, ngăn cách bằng `:`.
 *
 * Bỏ qua phần rỗng. Throw nếu phần chứa `:` (phá vỡ convention parse prefix).
 *
 * ⚠️ Chỉ dùng cho phần TĨNH `{namespace}:{entity}:{version}` (khai trong
 * `caches/keys.ts`). KHÔNG nối discriminator động (userId…) ở đây — phần động
 * do `createCachedFetcher` tự ghép lúc `fetch(arg)`.
 *
 * @example
 * cacheKey(CacheNamespace.Keno, "global-config", "v1")  // "keno:global-config:v1"
 * cacheKey(CacheNamespace.Identity, "user", "v1")       // "identity:user:v1"
 * discriminator KHÔNG nối ở đây → truyền qua fetch("u_123") → "identity:user:v1:u_123"
 */
export function cacheKey(...parts: string[]): string {
  if (parts == null || parts.length === 0) {
    throw new Error("cacheKey parts không được rỗng");
  }

  const cleaned = parts.filter((p) => p.length > 0);
  for (const part of cleaned) {
    if (part.includes(":")) {
      throw new Error(`cacheKey part không được chứa ":" — nhận "${part}"`);
    }
  }

  return cleaned.join(":");
}

/**
 * Hash 1 phần key nhạy cảm (apiKey, token…) trước khi đưa vào cache key.
 *
 * sha256 truncate 16 hex chars — đủ chống collision cho cardinality cache key,
 * đủ ngắn để đọc log. KHÔNG dùng cho mục đích bảo mật khác.
 *
 * @example
 * cacheKey("identity", "tenant-by-apikey", "v1", hashKeyPart(apiKey))
 */
export function hashKeyPart(raw: string): string {
  if (raw == null || raw.length === 0) {
    throw new Error("hashKeyPart raw không được rỗng");
  }

  return sha256Hex(raw).slice(0, 16);
}
