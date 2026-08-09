/**
 * Khai báo global augmentation của @megawin/cache — GOM 1 CHỖ.
 *
 * Mọi biến `globalThis.__xxx` dùng để cache singleton qua Next.js dev HMR
 * (tránh tạo lại store / reconnect Redis mỗi lần reload module) được khai ở
 * đây, KHÔNG rải `declare global` trong từng file implementation.
 *
 * TypeScript tự gom mọi `declare global` trong các file thuộc `include` vào
 * global scope — file này chỉ cần nằm trong `src` (đã include) là có hiệu lực,
 * không cần import ở nơi sử dụng, không cần cấu hình tsconfig thêm.
 */

import type { RedisClientType } from "redis";

import type { CacheStore } from "../../types";

declare global {
  // Cache store singleton cho Next.js dev HMR — tránh tạo lại mỗi lần reload.
  var __megawinDefaultCacheStore: CacheStore | undefined;

  // Redis clients cache (theo env key) cho Next.js dev HMR — tránh connect lại.
  var __nextJsRedisClients: Map<string, RedisClientType> | undefined;
}
