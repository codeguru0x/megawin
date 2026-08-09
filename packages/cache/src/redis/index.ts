/**
 * Redis primitives — client factory + RedisRepository.
 *
 * Dành cho use case Redis-specific (counter, hash, set, lock, rate-limit…).
 * Với nhu cầu CACHE thuần (get/set/delete + TTL), dùng `RedisCacheStore`
 * từ `@megawin/cache/stores` — adapter fail-open trên RedisRepository.
 */
export { default as getRedisClient } from "./client";
export { RedisRepository } from "./repository";
export type {
  ExpireMode,
  RedisClient,
  RedisCommandOptions,
  RedisMultiCommand,
  SortedSetMember,
  ZAddOptions,
  ZRangeByScoreOptions,
  ZRangeOptions,
} from "./types";
