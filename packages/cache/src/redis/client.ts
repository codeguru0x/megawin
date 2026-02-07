import { createClient } from "redis";
import { isDevNextJs } from "@megawin/shared/utils/env";

const __redisClientCache__ = new Map<string, ReturnType<typeof createClient>>();

/**
 * Lấy redis client cache cho NextJS
 * Trong dev NextJS thì sẽ sử dụng globalThis để cache
 * để khi HMR (Hot Module Replacement) ko cần connect lại
 * @returns Map<string, MongoClient>
 */
function getClientCache(): Map<string, ReturnType<typeof createClient>> {
  if (!isDevNextJs) {
    return __redisClientCache__;
  }

  if (!globalThis.__nextJsRedisClients) {
    globalThis.__nextJsRedisClients = new Map();
  }
  return globalThis.__nextJsRedisClients;
}

/**
 * Lấy redis client cache
 * @param redisEnvKey Redis env key
 * @returns
 */
const getRedisClient = async (
  redisEnvKey?: string
): Promise<ReturnType<typeof createClient>> => {
  // Nếu không có uri thì tự động  tìm  env REDIS_URI
  redisEnvKey = redisEnvKey ?? "REDIS_URI";

  const clientCache = getClientCache();

  const cached = clientCache.get(redisEnvKey);
  if (cached) {
    return cached;
  }

  // Lấy url từ env
  const url = process.env[redisEnvKey];

  if (!url) {
    throw new Error(`Missing env ${redisEnvKey}`);
  }

  try {
    const client = await createClient({ url })
      .on("error", (err) => console.log("Redis Client Error: ", err))
      .connect();

    clientCache.set(redisEnvKey, client);

    return client;
  } catch (error) {
    console.error("Redis connection error: ", error);
    throw new Error("Connect to redis server error");
  }
};

export default getRedisClient;
