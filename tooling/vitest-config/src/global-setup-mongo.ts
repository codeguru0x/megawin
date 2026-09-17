import { buildWorkspaceDeps } from "./testcontainers/build-deps";
import { getSharedMongoContainer } from "./testcontainers/mongo-container";

/**
 * Vitest `globalSetup` cho package chạm Mongo — start (hoặc attach) shared Mongo
 * container 1 lần cho toàn bộ lần `vitest run`, rồi set `process.env.MONGODB_URI`.
 *
 * KHÔNG `stop()` container ở teardown — package khác trong cùng `turbo run test` có thể
 * vẫn đang dùng (reuse). Ryuk reaper của Testcontainers tự dọn cuối session/CI job.
 */
export async function setup(): Promise<void> {
  buildWorkspaceDeps();
  const container = await getSharedMongoContainer();
  // Container chỉ có 1 node replica set `rs0` — driver cần `directConnection=true`
  // để không cố discover topology qua node khác không tồn tại.
  process.env.MONGODB_URI = `${container.getConnectionString()}?directConnection=true`;
}
