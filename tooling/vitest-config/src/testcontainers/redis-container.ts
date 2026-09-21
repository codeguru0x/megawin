import { RedisContainer, type StartedRedisContainer } from "@testcontainers/redis";

let containerPromise: Promise<StartedRedisContainer> | undefined;

/** Singleton Redis container, cùng cơ chế reuse như Mongo — xem mongo-container.ts. */
export function getSharedRedisContainer(): Promise<StartedRedisContainer> {
  if (!containerPromise) {
    // Pin 8.6 = đúng version production. Tag "redis:8" là FLOATING — ngày
    // 2026-09-21 resolve ra 8.10.1, lệch 2 minor so với prod. Nâng prod thì
    // sửa đúng dòng này (p0-00 B0.1).
    containerPromise = new RedisContainer("redis:8.6").withReuse().start();
  }
  return containerPromise;
}
