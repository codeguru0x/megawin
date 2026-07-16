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

export type { CacheStore, CachedFetcher, CachedFetcherOptions, CacheFetchEvent } from "./types";
export { cacheKey, hashKeyPart } from "./keys";
export { CacheNamespace } from "./namespaces";
export { createCachedFetcher } from "./cached-fetcher";
export {
  MemoryCacheStore,
  NoopCacheStore,
  RedisCacheStore,
  TieredCache,
  getDefaultCacheStore,
} from "./stores";
export type { MemoryCacheStoreOptions, RedisCacheStoreOptions, TieredCacheOptions } from "./stores";
