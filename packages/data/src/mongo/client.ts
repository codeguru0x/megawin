import { Db, MongoClient } from "mongodb";
import { isDevNextJs } from "@megawin/shared/utils/env";

const __mongoClientCache__ = new Map<string, MongoClient>();
const __mongoDbCache__ = new Map<string, Db>(); // `${envKey}::${dbName}`

/**
 * Lấy cache mongodb client cho NextJS
 * Trong dev NextJS thì sẽ sử dụng globalThis để cache
 * để khi HMR (Hot Module Replacement) ko cần connect lại
 * @returns Map<string, MongoClient>
 */
function getClientCache(): Map<string, MongoClient> {
  if (!isDevNextJs) {
    return __mongoClientCache__;
  }

  if (!globalThis.__nextJsMongoClients) {
    globalThis.__nextJsMongoClients = new Map();
  }
  return globalThis.__nextJsMongoClients;
}

/**
 * Lấy cache mongodb db cho NextJS
 * Trong dev NextJS thì sẽ sử dụng globalThis để cache
 * để khi HMR (Hot Module Replacement) ko cần connect lại
 * @returns
 */
function getDbCache(): Map<string, Db> {
  if (!isDevNextJs) {
    return __mongoDbCache__;
  }

  if (!globalThis.__nextJsMongoDbCache) {
    globalThis.__nextJsMongoDbCache = new Map();
  }
  return globalThis.__nextJsMongoDbCache;
}

/**
 * Lấy thông tin mongodb client
 * @param param0
 * @returns
 */
export const getMongoClient = async ({
  mongoEnvKey,
  clientOptions,
}: {
  mongoEnvKey: string;
  clientOptions?: ConstructorParameters<typeof MongoClient>[1];
}): Promise<MongoClient> => {
  // Nếu không có uri thì tự động  tìm  env MONGODB_URI
  mongoEnvKey = mongoEnvKey ?? "MONGODB_URI";

  const clientCache = getClientCache();

  const cached = clientCache.get(mongoEnvKey);
  if (cached) {
    return cached;
  }

  // Lấy uri từ env
  const url = process.env[mongoEnvKey];

  if (!url) {
    throw new Error(`Missing env ${mongoEnvKey}`);
  }

  try {
    console.log(`create mongodb client in ${process.env.NODE_ENV} env`);

    const client = new MongoClient(url, clientOptions);
    await client.connect();

    clientCache.set(mongoEnvKey, client);

    return client;
  } catch (error) {
    console.error("MongoDB connection error:", error);
    throw new Error("Connect to database server error");
  }
};

/**
 * Lấy thông tin mongodb db
 * @param mongoEnvKey
 * @param dbName
 * @param options
 * @returns
 */
export async function getMongoDb({
  mongoEnvKey,
  dbName,
  clientOptions,
}: {
  mongoEnvKey: string;
  dbName: string;
  clientOptions?: ConstructorParameters<typeof MongoClient>[1];
}): Promise<Db> {
  if (!dbName) {
    throw new Error("dbName is required");
  }

  // Tạo cache key
  const cacheKey = `${mongoEnvKey}::${dbName}`;

  const dbCache = getDbCache();

  // Kiểm tra cache
  const cached = dbCache.get(cacheKey);

  // Nếu có cache thì trả về cache
  if (cached) {
    return cached;
  }

  const client = await getMongoClient({ mongoEnvKey, clientOptions });
  const db = client.db(dbName);

  // Lưu db cache
  dbCache.set(cacheKey, db);
  return db;
}
