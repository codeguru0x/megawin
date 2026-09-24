/**
 * Khoá hành vi nền tảng Redis 8.6 mà việc #1 dựa vào (p0-01b R10–R12).
 *
 * `flushDb()` trong beforeEach. `fileParallelism: false` ở vitest.config.
 */

import { createHash } from "node:crypto";

import { getRedisClient, RedisRepository } from "@megawin/cache/redis";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GCRA_LUA_SCRIPT } from "../../src/rate-limit/gcra.lua";
import { RateLimiter } from "../../src/rate-limit/rate-limiter";
import { GuardSubjectType, type RateLimitRule } from "../../src/types";

const ROUTE = "p001b.script-cache";
const SUBJECT = { type: GuardSubjectType.Ip, id: "203.0.113.40" } as const;
const RULE: RateLimitRule = { limit: 5, windowSec: 60, burst: 4 };

function localSha(script: string): string {
  return createHash("sha1").update(script).digest("hex");
}

function gcraArgs(nowMs: number): string[] {
  return ["2000", "8000", String(nowMs)];
}

beforeEach(async () => {
  const client = await getRedisClient();
  await client.flushDb();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Redis script cache — tiền đề việc #1", () => {
  it("R10: EVAL tự nạp script vào script cache — EVALSHA sau đó không throw", async () => {
    const client = await getRedisClient();
    const repo = new RedisRepository();
    const sha = localSha(GCRA_LUA_SCRIPT);
    const now = Date.now();

    await client.scriptFlush();

    await expect(repo.eval(GCRA_LUA_SCRIPT, ["guard:r10:a"], gcraArgs(now))).resolves.toBeDefined();
    await expect(repo.evalSha(sha, ["guard:r10:b"], gcraArgs(now))).resolves.toBeDefined();
  });

  it("R11: SHA1 local === SHA Redis tự tính", async () => {
    const client = await getRedisClient();
    const serverSha = await client.scriptLoad(GCRA_LUA_SCRIPT);

    let capturedSha: string | undefined;
    vi.spyOn(RedisRepository.prototype, "evalSha").mockImplementation(async function (
      this: RedisRepository,
      sha: string,
      keys: string[],
      args: string[],
    ) {
      capturedSha = sha;
      const client = await this.getClient();
      return await client.evalSha(sha, { keys, arguments: args });
    });

    const limiter = new RateLimiter();
    const decision = await limiter.checkRateLimit({
      route: ROUTE,
      subject: SUBJECT,
      rule: RULE,
    });

    expect(decision.failedOpen).toBe(false);
    expect(capturedSha).toBe(serverSha);
    expect(capturedSha).toBe(localSha(GCRA_LUA_SCRIPT));
  });

  it("R12: PX 0 bị Redis reject (giả định việc #3)", async () => {
    const client = await getRedisClient();
    await expect(client.set("guard:r12:px0", "1", { PX: 0 })).rejects.toThrow(/invalid expire time/i);
  });
});
