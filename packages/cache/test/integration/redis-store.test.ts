/**
 * RedisCacheStore — integration tests trên Redis Testcontainers.
 *
 * Cover roundtrip, Date codec, ttlSec<=0 no-op, delete/deleteByPrefix.
 * Fail-open khi Redis down: không cover ở phase này (xem plan p0-03).
 */

import { beforeEach, describe, expect, it } from "vitest";

import { getRedisClient } from "../../src/redis/client";
import { RedisCacheStore } from "../../src/stores/redis-store";

const store = new RedisCacheStore({ commandTimeoutMs: 5_000 });

beforeEach(async () => {
  const client = await getRedisClient();
  await client.flushDb();
});

describe("RedisCacheStore", () => {
  it("set/get roundtrip", async () => {
    await store.set("k1", { v: 42 }, 60);
    expect(await store.get("k1")).toEqual({ v: 42 });
  });

  it("Date field không bị JSON làm mất kiểu (json-date-codec)", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    await store.set("k1", { createdAt: now }, 60);
    const result = await store.get<{ createdAt: Date }>("k1");
    expect(result?.createdAt).toBeInstanceOf(Date);
    expect(result?.createdAt.toISOString()).toBe(now.toISOString());
  });

  it("ttlSec <= 0 → không ghi (no-op)", async () => {
    await store.set("k1", { v: 1 }, 0);
    expect(await store.get("k1")).toBeUndefined();
  });

  it("delete xoá key", async () => {
    await store.set("k1", { v: 1 }, 60);
    await store.delete("k1");
    expect(await store.get("k1")).toBeUndefined();
  });

  it("deleteByPrefix chỉ xoá key match prefix", async () => {
    await store.set("keno:config:v1", { v: 1 }, 60);
    await store.set("mega645:config:v1", { v: 2 }, 60);
    expect(await store.get("mega645:config:v1")).toEqual({ v: 2 });
    await store.deleteByPrefix("keno:config:v1");
    expect(await store.get("keno:config:v1")).toBeUndefined();
    expect(await store.get("mega645:config:v1")).toEqual({ v: 2 });
  });
});
