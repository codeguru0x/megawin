/**
 * Cache module: Tenant Config (Keno).
 *
 * Sở hữu TOÀN BỘ cache concern cho tenant config — key, TTL, loader,
 * invalidation — tách khỏi use-case (use-case chỉ gọi `fetch`/`invalidate`).
 *
 * Policy: read-through TTL 60s per tenantId, single-flight, stale-on-error,
 * negative caching (tenant chưa có config cũng cache — tránh dội DB).
 */

import { createCachedFetcher, getDefaultCacheStore } from "@megawin/cache";
import { TenantConfigRepository } from "../infras/repos/tenant-config-repo";
import type { TenantConfigEntity } from "@megawin/game-keno/entities";
import { KENO_CACHE_KEYS } from "./keys";

let repo: TenantConfigRepository | null = null;

/** Lazy singleton — tạo repo ở fetch đầu tiên (không phải lúc import), tái dùng qua warm invocation (Lambda) và song song (Next.js). Repo stateless nên share an toàn. */
function getRepo(): TenantConfigRepository {
  if (!repo) {
    repo = new TenantConfigRepository();
  }

  return repo;
}

// Module-level singleton — mọi use-case trong process share cùng 1 cache.
const fetcher = createCachedFetcher<string, TenantConfigEntity | null>(
  (tenantId) => getRepo().getTenantConfig(tenantId),
  {
    store: getDefaultCacheStore(),
    keyPrefix: KENO_CACHE_KEYS.tenantConfig,
    ttlSec: 60 * 10, // 10 minutes
  },
);

/**
 * Cache read-through cho tenant config Keno (per tenantId).
 *
 * - `fetch(tenantId)`      : dùng trong read use-cases thay cho repo trực tiếp.
 * - `invalidate(tenantId)` : gọi sau khi upsert thành công (update use-case).
 *   Cross-process: container khác tự hết hạn theo TTL 60s (hoặc qua L2 Redis).
 */
export const tenantConfigCache = {
  fetch: (tenantId: string): Promise<TenantConfigEntity | null> => fetcher.fetch(tenantId),
  invalidate: (tenantId: string): Promise<void> => fetcher.invalidate(tenantId),
};
