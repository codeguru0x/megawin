/**
 * Key registry của `@megawin/guard` — phần TĨNH `{namespace}:{entity}:{version}`.
 *
 * Discriminator động (route + subject) ghép runtime qua `buildRateLimitKey` —
 * KHÔNG gọi `cacheKey()` inline ở chỗ khác (`cache-design.mdc` §2.2).
 */

import { cacheKey, CacheNamespace, hashKeyPart } from "@megawin/cache";

import type { GuardSubjectType } from "./types";

/** Prefix TĨNH đăng ký 1 lần — bump `v{n}` khi đổi shape/semantics key. */
export const GUARD_KEYS = {
  /** Rate limit GCRA TAT — `guard:rl:v1`. */
  rateLimit: cacheKey(CacheNamespace.Guard, "rl", "v1"),
} as const;

/**
 * Ghép key rate-limit đầy đủ: `guard:rl:v1:{route}:{subjectType}_{hash(subjectId)}`.
 *
 * - `route` là hằng do developer khai (`"keno.place-bet"`) — giữ nguyên văn để
 *   đọc được khi debug Redis; không hash.
 * - `subjectId` (IP / accountId) đi qua `hashKeyPart()` vì dữ liệu client ảnh
 *   hưởng và key lộ trong log/monitoring Redis.
 * - Phần động nối bằng `_` giữa type và hash, **không** dùng `:` (phá phân tầng).
 *
 * @param route       - Route id tĩnh (không chứa `:`).
 * @param subjectType - `GuardSubjectType` member.
 * @param subjectId   - Id thô (IP / accountId / tenantId) — sẽ được hash.
 */
export function buildRateLimitKey(route: string, subjectType: GuardSubjectType, subjectId: string): string {
  if (route.includes(":")) {
    throw new Error(`buildRateLimitKey route không được chứa ":" — nhận "${route}"`);
  }

  const hashedId = hashKeyPart(subjectId);
  return `${GUARD_KEYS.rateLimit}:${route}:${subjectType}_${hashedId}`;
}
