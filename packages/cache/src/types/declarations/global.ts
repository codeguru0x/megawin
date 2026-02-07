import { createClient } from "redis";

declare global {
  // Redis client
  // eslint-disable-next-line no-var
  var __nextJsRedisClients:
    | Map<string, ReturnType<typeof createClient>>
    | undefined;
}

// Export empty object to ensure this file is treated as a module
export {};
