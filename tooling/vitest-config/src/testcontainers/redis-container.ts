import { RedisContainer, type StartedRedisContainer } from "@testcontainers/redis";

let containerPromise: Promise<StartedRedisContainer> | undefined;

/** Singleton Redis container, cùng cơ chế reuse như Mongo — xem mongo-container.ts. */
export function getSharedRedisContainer(): Promise<StartedRedisContainer> {
  if (!containerPromise) {
    containerPromise = new RedisContainer("redis:8").withReuse().start();
  }
  return containerPromise;
}
