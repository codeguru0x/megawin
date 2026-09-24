/**
 * RateLimiter — đường gọi Lua (p0-01b R13–R18).
 *
 * `cachedGcraSha` của code cũ là state module. R13/R14 chỉ đỏ trên code cũ khi
 * chạy **đúng file này trong process mới** — không phải sau `rate-limiter.test.ts`
 * (SHA đã ấm). Code mới không còn state đó nên full suite vẫn là oracle đúng.
 *
 * `flushDb()` trong beforeEach. `fileParallelism: false` ở vitest.config.
 */

import { getRedisClient, RedisRepository } from "@megawin/cache/redis";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GCRA_LUA_SCRIPT } from "../../src/rate-limit/gcra.lua";
import { RateLimiter } from "../../src/rate-limit/rate-limiter";
import { GuardSubjectType, type RateLimitRule } from "../../src/types";

const SUBJECT_A = { type: GuardSubjectType.Ip, id: "203.0.113.50" } as const;
const RULE_BURST: RateLimitRule = { limit: 5, windowSec: 60, burst: 4 };

beforeEach(async () => {
  const client = await getRedisClient();
  await client.flushDb();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RateLimiter — EVALSHA / không SCRIPT LOAD", () => {
  it("R13: cold start trên Redis đã có script → đúng 1 RTT (evalSha 1, eval 0, scriptLoad 0)", async () => {
    const client = await getRedisClient();
    await client.scriptLoad(GCRA_LUA_SCRIPT);

    const evalShaSpy = vi.spyOn(RedisRepository.prototype, "evalSha");
    const evalSpy = vi.spyOn(RedisRepository.prototype, "eval");
    const loadSpy = vi.spyOn(RedisRepository.prototype, "scriptLoad");

    const limiter = new RateLimiter();
    const decision = await limiter.checkRateLimit({
      route: "p001b.r13",
      subject: SUBJECT_A,
      rule: RULE_BURST,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.failedOpen).toBe(false);
    expect(evalShaSpy).toHaveBeenCalledTimes(1);
    expect(evalSpy).not.toHaveBeenCalled();
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("R14: scriptLoad không bao giờ được gọi ở mọi kịch bản (cold / warm / sau SCRIPT FLUSH)", async () => {
    const limiter = new RateLimiter();
    const client = await getRedisClient();
    const loadSpy = vi.spyOn(RedisRepository.prototype, "scriptLoad");

    await limiter.checkRateLimit({ route: "p001b.r14.cold", subject: SUBJECT_A, rule: RULE_BURST });
    expect(loadSpy).not.toHaveBeenCalled();
    loadSpy.mockClear();

    await limiter.checkRateLimit({ route: "p001b.r14.warm", subject: SUBJECT_A, rule: RULE_BURST });
    expect(loadSpy).not.toHaveBeenCalled();
    loadSpy.mockClear();

    await client.scriptFlush();
    await limiter.checkRateLimit({ route: "p001b.r14.flush", subject: SUBJECT_A, rule: RULE_BURST });
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("R15: SCRIPT FLUSH → tự phục hồi trong 1 request (eval đúng 1 lần, allowed)", async () => {
    const limiter = new RateLimiter();
    const client = await getRedisClient();

    // Rule còn quota: burst: 4 → 2 lần gọi vẫn allowed. SCRIPT FLUSH không xoá key.
    const first = await limiter.checkRateLimit({
      route: "p001b.r15",
      subject: SUBJECT_A,
      rule: RULE_BURST,
    });
    expect(first.allowed).toBe(true);
    expect(first.failedOpen).toBe(false);

    await client.scriptFlush();

    const evalSpy = vi.spyOn(RedisRepository.prototype, "eval");
    const second = await limiter.checkRateLimit({
      route: "p001b.r15",
      subject: SUBJECT_A,
      rule: RULE_BURST,
    });

    expect(second.allowed).toBe(true);
    expect(second.failedOpen).toBe(false);
    expect(evalSpy).toHaveBeenCalledTimes(1);
  });

  it("R16: NOSCRIPT + scriptLoad lỗi không kéo lần sau về EVAL", async () => {
    const limiter = new RateLimiter();
    await limiter.checkRateLimit({ route: "p001b.r16", subject: SUBJECT_A, rule: RULE_BURST });

    let noscriptOnce = true;
    const infectSha = vi.spyOn(RedisRepository.prototype, "evalSha").mockImplementation(async function (
      this: RedisRepository,
      sha: string,
      keys: string[],
      args: string[],
    ) {
      if (noscriptOnce) {
        noscriptOnce = false;
        throw new Error("NOSCRIPT No matching script");
      }
      const client = await this.getClient();
      return await client.evalSha(sha, { keys, arguments: args });
    });
    vi.spyOn(RedisRepository.prototype, "scriptLoad").mockRejectedValue(new Error("SCRIPT LOAD failed"));

    const infected = await limiter.checkRateLimit({
      route: "p001b.r16.infect",
      subject: SUBJECT_A,
      rule: RULE_BURST,
    });
    expect(infected.failedOpen).toBe(false);
    infectSha.mockRestore();

    const evalShaSpy = vi.spyOn(RedisRepository.prototype, "evalSha");
    const evalSpy = vi.spyOn(RedisRepository.prototype, "eval");
    const after = await limiter.checkRateLimit({
      route: "p001b.r16.after",
      subject: SUBJECT_A,
      rule: RULE_BURST,
    });

    expect(after.failedOpen).toBe(false);
    expect(evalShaSpy).toHaveBeenCalled();
    expect(evalSpy).not.toHaveBeenCalled();
  });

  it("R17: lỗi khác có chữ NOSCRIPT trong body → không fallback EVAL", async () => {
    const limiter = new RateLimiter();
    vi.spyOn(RedisRepository.prototype, "evalSha").mockRejectedValue(
      new Error("WRONGTYPE Operation against a key holding the wrong kind of value NOSCRIPT buried"),
    );
    const evalSpy = vi.spyOn(RedisRepository.prototype, "eval");

    const decision = await limiter.checkRateLimit({
      route: "p001b.r17",
      subject: SUBJECT_A,
      rule: RULE_BURST,
    });

    expect(decision.failedOpen).toBe(true);
    expect(decision.allowed).toBe(true);
    expect(evalSpy).not.toHaveBeenCalled();
  });

  it("R18: NOSCRIPT thật → có fallback EVAL", async () => {
    const limiter = new RateLimiter();
    vi.spyOn(RedisRepository.prototype, "evalSha").mockRejectedValue(new Error("NOSCRIPT No matching script"));
    const evalSpy = vi.spyOn(RedisRepository.prototype, "eval").mockImplementation(async function (
      this: RedisRepository,
      script: string,
      keys: string[],
      args: string[],
    ) {
      const client = await this.getClient();
      return await client.eval(script, { keys, arguments: args });
    });

    const decision = await limiter.checkRateLimit({
      route: "p001b.r18",
      subject: SUBJECT_A,
      rule: RULE_BURST,
    });

    expect(evalSpy).toHaveBeenCalled();
    expect(decision.failedOpen).toBe(false);
    expect(decision.allowed).toBe(true);
  });
});
