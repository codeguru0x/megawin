/**
 * @megawin/cache — layered cache (L1 memory + L2 Redis) cho toàn hệ thống.
 *
 * Entry point chính. Consumer thông thường chỉ cần:
 *
 * @example
 * import { createCachedFetcher, cacheKey, getDefaultCacheStore } from "@megawin/cache";
 *
 * const cachedConfig = createCachedFetcher(() => repo.getGlobalConfig(), {
 *   store: getDefaultCacheStore(),
 *   keyPrefix: cacheKey("keno", "global-config", "v1"),
 *   ttlSec: 60,
 * });
 */

export { createCachedFetcher } from "./cached-fetcher";
export { cacheKey, hashKeyPart } from "./keys";
export { CacheNamespace } from "./namespaces";
export type { MemoryCacheStoreOptions, RedisCacheStoreOptions, TieredCacheOptions } from "./stores";
export {
  getDefaultCacheStore,
  MemoryCacheStore,
  NoopCacheStore,
  RedisCacheStore,
  TieredCache,
} from "./stores";
export type { CachedFetcher, CachedFetcherOptions, CacheFetchEvent, CacheStore } from "./types";
