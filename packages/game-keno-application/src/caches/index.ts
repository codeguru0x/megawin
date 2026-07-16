/**
 * Barrel: cache modules của Keno application.
 *
 * Layer song song với use-cases — mỗi entity hot có 1 file `*.cache.ts`
 * sở hữu key/TTL/loader/invalidation. Use-case chỉ import từ đây,
 * KHÔNG tự tạo `createCachedFetcher` inline.
 */

export { globalConfigCache } from "./global-config.cache";
export { tenantConfigCache } from "./tenant-config.cache";
