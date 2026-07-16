/**
 * Registry cache key của game-max3dpro-application — 1 nơi duy nhất khai key.
 *
 * Namespace lấy từ `CacheNamespace` toàn cục (chống typo/va chạm cross-package);
 * entity + version quản tại đây. Đổi tên/bump version chỉ sửa 1 chỗ.
 */

import { CacheNamespace, cacheKey } from "@megawin/cache";

const NS = CacheNamespace.Max3dpro;

/** Cache key prefix của Max 3D Pro. Value = kết quả `cacheKey(...)`. */
export const MAX3DPRO_CACHE_KEYS = {
  /** Global config (áp dụng mọi tenant). */
  globalConfig: cacheKey(NS, "global-config", "v1"),
  /** Tenant config theo tenantId. */
  tenantConfig: cacheKey(NS, "tenant-config", "v1"),
} as const;
