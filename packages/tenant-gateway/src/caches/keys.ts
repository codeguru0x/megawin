/**
 * Registry cache key của tenant-gateway — 1 nơi duy nhất khai key cho package.
 *
 * Namespace lấy từ `CacheNamespace` toàn cục (chống typo/va chạm cross-package);
 * entity + version quản tại đây. Đổi tên/bump version chỉ sửa 1 chỗ, mọi consumer
 * (kể cả invalidate ở identity-application) tự đồng bộ vì import từ file này.
 */

import { CacheNamespace, cacheKey } from "@megawin/cache";

const NS = CacheNamespace.TenantGw;

/** Cache key prefix của tenant-gateway. Value = kết quả `cacheKey(...)`. */
export const TENANT_GW_CACHE_KEYS = {
  /** Callback config theo tenantId (callbackBaseUrl + apiKey). */
  callbackConfig: cacheKey(NS, "callback-config", "v1"),
} as const;
