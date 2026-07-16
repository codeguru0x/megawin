/**
 * Registry cache key của game-power655-application — 1 nơi duy nhất khai key.
 *
 * Namespace lấy từ `CacheNamespace` toàn cục (chống typo/va chạm cross-package);
 * entity + version quản tại đây. Đổi tên/bump version chỉ sửa 1 chỗ.
 */

import { CacheNamespace, cacheKey } from "@megawin/cache";

const NS = CacheNamespace.Power655;

/** Cache key prefix của Power 6/55. Value = kết quả `cacheKey(...)`. */
export const POWER655_CACHE_KEYS = {
  /** Global config (áp dụng mọi tenant). */
  globalConfig: cacheKey(NS, "global-config", "v1"),
  /** Tenant config theo tenantId. */
  tenantConfig: cacheKey(NS, "tenant-config", "v1"),
} as const;
