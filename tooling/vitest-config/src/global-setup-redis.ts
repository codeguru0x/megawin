import { buildWorkspaceDeps } from "./testcontainers/build-deps";
import { getSharedRedisContainer } from "./testcontainers/redis-container";

/**
 * Vitest `globalSetup` cho package chạm Redis — start (hoặc attach) shared Redis
 * container 1 lần cho toàn bộ lần `vitest run`, rồi set `process.env.REDIS_URI`.
 *
 * Cùng lý do KHÔNG `stop()` — xem `global-setup-mongo.ts`.
 */
export async function setup(): Promise<void> {
  buildWorkspaceDeps();
  const container = await getSharedRedisContainer();
  process.env.REDIS_URI = container.getConnectionUrl();
}
