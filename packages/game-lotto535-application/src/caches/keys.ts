/**
 * Registry cache key của game-lotto535-application — 1 nơi duy nhất khai key.
 *
 * Namespace lấy từ `CacheNamespace` toàn cục (chống typo/va chạm cross-package);
 * entity + version quản tại đây. Đổi tên/bump version chỉ sửa 1 chỗ.
 */

import { CacheNamespace, cacheKey } from "@megawin/cache";

const NS = CacheNamespace.Lotto535;

/** Cache key prefix của Lotto 5/35. Value = kết quả `cacheKey(...)`. */
export const LOTTO535_CACHE_KEYS = {
  /** Global config (áp dụng mọi tenant). */
  globalConfig: cacheKey(NS, "global-config", "v1"),
  /** Tenant config theo tenantId. */
  tenantConfig: cacheKey(NS, "tenant-config", "v1"),
  /** Jackpot cycle đang active — CHỈ dùng cho read path hiển thị (xem `active-jackpot-cycle.cache.ts`). */
  activeJackpotCycle: cacheKey(NS, "active-jackpot-cycle", "v1"),
} as const;
