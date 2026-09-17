/**
 * RedisRepository — integration tests trên Redis Testcontainers.
 *
 * Container start 1 lần qua `@megawin/vitest-config/global-setup-redis`.
 * `flushDb` trong beforeEach chỉ dọn DATA, không restart container.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getRedisClient } from "../../src/redis/client";
import { RedisRepository } from "../../src/redis/repository";

const repo = new RedisRepository();

beforeEach(async () => {
  const client = await getRedisClient();
  await client.flushDb();
});

afterAll(async () => {
  const client = await getRedisClient();
  await client.flushDb();
});

describe("RedisRepository — string/JSON", () => {
  it("setJson/getJson roundtrip", async () => {
    await repo.setJson("k1", { v: 42 }, 60);
    expect(await repo.getJson("k1")).toEqual({ v: 42 });
  });

  it("get key không tồn tại → null", async () => {
    expect(await repo.get("missing")).toBeNull();
  });

  it("set kèm TTL → key tự hết hạn", async () => {
    await repo.set("k1", "v1", 1);
    expect(await repo.ttl("k1")).toBeGreaterThan(0);
  });
});

describe("RedisRepository — counter/hash/set/sorted-set", () => {
  it("incrBy tăng atomic", async () => {
    expect(await repo.incrBy("counter", 5)).toBe(5);
    expect(await repo.incrBy("counter", 3)).toBe(8);
  });

  it("hIncrBy tăng field trong hash", async () => {
    expect(await repo.hIncrBy("h1", "f1", 2)).toBe(2);
  });

  it("sAdd + sIsMember", async () => {
    await repo.sAdd("set1", ["a", "b"]);
    expect(await repo.sIsMember("set1", "a")).toBe(true);
    expect(await repo.sIsMember("set1", "z")).toBe(false);
  });

  it("zAdd + zRangeWithScores", async () => {
    await repo.zAdd("z1", [
      { score: 1, value: "a" },
      { score: 2, value: "b" },
    ]);
    expect(await repo.zRangeWithScores("z1", 0, -1)).toEqual([
      { score: 1, value: "a" },
      { score: 2, value: "b" },
    ]);
  });
});

describe("RedisRepository — deleteByPrefix (SCAN + DEL batch)", () => {
  it("chỉ xoá key match prefix", async () => {
    await repo.set("keno:config:v1", "a");
    await repo.set("keno:config:v1:t1", "b");
    await repo.set("mega645:config:v1", "c");
    await repo.deleteByPrefix("keno:config:v1");
    expect(await repo.exists("keno:config:v1")).toBe(false);
    expect(await repo.exists("keno:config:v1:t1")).toBe(false);
    expect(await repo.exists("mega645:config:v1")).toBe(true);
  });
});
