/**
 * defaultCacheStore — composition mặc định cho toàn hệ thống, quyết định qua env.
 *
 * Consumer (game-*-application…) import `getDefaultCacheStore()` — KHÔNG tự
 * new store. Backend nâng cấp qua env, không đổi code use-case:
 *
 * | Env                   | Store                                        |
 * |-----------------------|----------------------------------------------|
 * | `CACHE_DISABLED=true` | NoopCacheStore — tắt cache khi debug          |
 * | Không có `REDIS_URI`  | MemoryCacheStore (L1-only) — Phase 1          |
 * | Có `REDIS_URI`        | TieredCache (L1 memory + L2 Redis) — Phase 3  |
 *
 * Singleton per-process — mọi cached fetcher share cùng store để L1 bound
 * memory tổng thể và Redis client được tái dùng.
 */

import { isDevNextJs, logInfo } from "@megawin/shared/utils";

import { DEFAULT_L1_MAX, DEFAULT_L1_TTL_SEC, DEFAULT_REDIS_ENV_KEY } from "../constants";
import type { CacheStore } from "../types";
import "../types/declarations/global";
import { MemoryCacheStore } from "./memory-store";
import { NoopCacheStore } from "./noop-store";
import { RedisCacheStore } from "./redis-store";
import { TieredCache } from "./tiered-store";

// Global `__megawinDefaultCacheStore` khai tập trung ở src/types/declarations/global.ts.
let defaultStore: CacheStore | undefined;

/**
 * Tạo cache store mặc định của process dựa trên env (không cache — caller cache).
 *
 * Thứ tự quyết định: CACHE_DISABLED → Noop; thiếu REDIS_URI → Memory (L1-only);
 * có REDIS_URI → Tiered (L1 + L2 Redis).
 *
 * @returns CacheStore phù hợp môi trường hiện tại.
 */
function createDefaultCacheStore(): CacheStore {
  // Tắt cache hoàn toàn khi debug production issue (mọi get đều miss).
  if (process.env.CACHE_DISABLED === "true") {
    logInfo("CacheStore", "CACHE_DISABLED=true — dùng NoopCacheStore");
    return new NoopCacheStore();
  }

  const l1 = new MemoryCacheStore({ max: DEFAULT_L1_MAX });

  // Có REDIS_URI → nâng cấp thành tiered L1+L2. Không có → memory-only (Phase 1).
  if (!process.env[DEFAULT_REDIS_ENV_KEY]) {
    return l1;
  }

  return new TieredCache({
    l1,
    l2: new RedisCacheStore({ redisEnvKey: DEFAULT_REDIS_ENV_KEY }),
    l1TtlSec: DEFAULT_L1_TTL_SEC,
  });
}

/**
 * Lấy cache store mặc định của process (singleton, lazy-init).
 *
 * @example
 * const cachedConfig = createCachedFetcher(loader, {
 *   store: getDefaultCacheStore(),
 *   keyPrefix: cacheKey("keno", "global-config", "v1"),
 *   ttlSec: 60,
 * });
 */
export function getDefaultCacheStore(): CacheStore {
  // Next.js dev: giữ trên globalThis để HMR không tạo lại (mất L1 + leak Redis client).
  if (isDevNextJs()) {
    if (!globalThis.__megawinDefaultCacheStore) {
      globalThis.__megawinDefaultCacheStore = createDefaultCacheStore();
    }
    return globalThis.__megawinDefaultCacheStore;
  }

  if (!defaultStore) {
    defaultStore = createDefaultCacheStore();
  }

  return defaultStore;
}
