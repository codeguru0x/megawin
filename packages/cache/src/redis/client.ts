/**
 * Redis client factory — singleton per env key, tự connect lần đầu, cache lại
 * để tái dùng qua nhiều lần gọi (connection pooling ngầm của node-redis).
 *
 * ⚠️ FAIL-FAST: throw khi thiếu env hoặc connect lỗi. Với nhu cầu CACHE thuần
 * (chấp nhận miss khi Redis down) hãy dùng `RedisCacheStore` — adapter fail-open
 * bọc ngoài. Đừng gọi thẳng client này trên hot path nếu chưa tự xử lý lỗi.
 */

import { isDevNextJs, logError } from "@megawin/shared/utils";
import { createClient, type RedisClientType } from "redis";

import { DEFAULT_REDIS_ENV_KEY } from "../constants";
import "../types/declarations/global";

// Global `__nextJsRedisClients` khai tập trung ở src/types/declarations/global.ts.

/** Cache client theo env key ở scope module — 1 connection dùng lại cho cả process. */
const __redisClientCache__ = new Map<string, RedisClientType>();

/**
 * Lấy Map cache client phù hợp môi trường.
 *
 * Prod/worker: cache ở scope module (mỗi process 1 Map, sống suốt vòng đời).
 * Next.js dev: cache trên `globalThis` để HMR (Hot Module Replacement) reload
 * module KHÔNG tạo connection mới → tránh leak client mỗi lần sửa code.
 *
 * @returns Map từ env key → Redis client đã connect.
 */
function getClientCache(): Map<string, RedisClientType> {
  if (!isDevNextJs()) {
    return __redisClientCache__;
  }

  if (!globalThis.__nextJsRedisClients) {
    globalThis.__nextJsRedisClients = new Map();
  }

  return globalThis.__nextJsRedisClients;
}

/**
 * Lấy Redis client đã connect cho 1 env key (singleton per key, lazy-connect).
 *
 * Lần đầu với 1 env key: đọc URI từ env, tạo client, connect, cache lại. Các
 * lần sau: trả client đã cache ngay (không connect lại). Nhiều env key khác
 * nhau → nhiều client độc lập (hỗ trợ trỏ nhiều instance Redis).
 *
 * @param redisEnvKey - Tên env chứa Redis URI. Mặc định {@link DEFAULT_REDIS_ENV_KEY}.
 * @returns Redis client đã connect, sẵn sàng chạy command.
 * @throws {Error} Khi thiếu env `redisEnvKey` hoặc connect thất bại (fail-fast).
 */
const getRedisClient = async (redisEnvKey?: string): Promise<RedisClientType> => {
  // Không truyền → dùng env mặc định chung (DRY, không hard-code chuỗi rời rạc).
  redisEnvKey = redisEnvKey ?? DEFAULT_REDIS_ENV_KEY;

  const clientCache = getClientCache();

  const cached = clientCache.get(redisEnvKey);

  if (cached) {
    return cached;
  }

  // Lấy URI từ env — thiếu là lỗi cấu hình, fail sớm để dễ phát hiện.
  const url = process.env[redisEnvKey];

  if (!url) {
    throw new Error(`Missing env ${redisEnvKey}`);
  }

  try {
    // Listener "error" bắt lỗi runtime SAU connect (mất kết nối giữa chừng…) —
    // không throw ở đây để client tự reconnect theo cơ chế của node-redis.
    const client = await createClient({ url })
      .on("error", (err) => logError("RedisClient", err, { redisEnvKey }))
      .connect();

    clientCache.set(redisEnvKey, client);

    return client;
  } catch (error) {
    logError("RedisClient", error, { redisEnvKey, phase: "connect" });
    throw new Error("Connect to redis server error");
  }
};

export default getRedisClient;
