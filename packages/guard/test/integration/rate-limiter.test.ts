/**
 * RateLimiter — integration trên Redis Testcontainers 8.6 (p0-01 B2 #14–#22).
 *
 * `flushDb()` trong beforeEach (bắt buộc). `fileParallelism: false` ở vitest.config.
 */

import { getRedisClient, RedisRepository } from "@megawin/cache/redis";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildRateLimitKey } from "../../src/keys";
import { GCRA_LUA_SCRIPT } from "../../src/rate-limit/gcra.lua";
import { RateLimiter } from "../../src/rate-limit/rate-limiter";
import { GuardSubjectType, type RateLimitRule } from "../../src/types";

const ROUTE = "keno.place-bet";
const SUBJECT_A = { type: GuardSubjectType.Ip, id: "203.0.113.10" } as const;
const SUBJECT_B = { type: GuardSubjectType.Ip, id: "198.51.100.20" } as const;

/** burst = limit - 1 → đúng `limit` request liền mạch được phép (GCRA). */
const RULE_BURST: RateLimitRule = { limit: 5, windowSec: 60, burst: 4 };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

beforeEach(async () => {
  const client = await getRedisClient();
  await client.flushDb();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RateLimiter — GCRA happy path", () => {
  it("limit request đầu trong window → tất cả allowed: true", async () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < RULE_BURST.limit; i++) {
      const decision = await limiter.checkRateLimit({
        route: ROUTE,
        subject: SUBJECT_A,
        rule: RULE_BURST,
      });
      expect(decision.allowed).toBe(true);
      expect(decision.failedOpen).toBe(false);
    }
  });

  it("request vượt → allowed: false và retryAfterMs > 0", async () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < RULE_BURST.limit; i++) {
      await limiter.checkRateLimit({ route: ROUTE, subject: SUBJECT_A, rule: RULE_BURST });
    }

    const denied = await limiter.checkRateLimit({
      route: ROUTE,
      subject: SUBJECT_A,
      rule: RULE_BURST,
    });

    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
    expect(denied.failedOpen).toBe(false);
  });

  it("chờ đúng retryAfterMs → allowed: true lại", async () => {
    const limiter = new RateLimiter();
    // Rule nhỏ để sleep ngắn: ei = 200ms, burst=0 → 1 request rồi chờ.
    const rule: RateLimitRule = { limit: 5, windowSec: 1, burst: 0 };

    const first = await limiter.checkRateLimit({ route: ROUTE, subject: SUBJECT_A, rule });
    expect(first.allowed).toBe(true);

    const denied = await limiter.checkRateLimit({ route: ROUTE, subject: SUBJECT_A, rule });
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBeGreaterThan(0);

    await sleep(denied.retryAfterMs + 20);

    const again = await limiter.checkRateLimit({ route: ROUTE, subject: SUBJECT_A, rule });
    expect(again.allowed).toBe(true);
    expect(again.failedOpen).toBe(false);
  });

  it("remainingBurst giảm dần và không âm", async () => {
    const limiter = new RateLimiter();
    let prev: number | undefined;

    for (let i = 0; i < RULE_BURST.limit; i++) {
      const decision = await limiter.checkRateLimit({
        route: ROUTE,
        subject: SUBJECT_A,
        rule: RULE_BURST,
      });
      expect(decision.remainingBurst).toBeGreaterThanOrEqual(0);
      if (prev !== undefined) {
        expect(decision.remainingBurst).toBeLessThanOrEqual(prev);
      }
      prev = decision.remainingBurst;
    }
  });

  it("2 subject khác nhau độc lập", async () => {
    const limiter = new RateLimiter();

    for (let i = 0; i < RULE_BURST.limit; i++) {
      await limiter.checkRateLimit({ route: ROUTE, subject: SUBJECT_A, rule: RULE_BURST });
    }
    const aDenied = await limiter.checkRateLimit({
      route: ROUTE,
      subject: SUBJECT_A,
      rule: RULE_BURST,
    });
    expect(aDenied.allowed).toBe(false);

    const bFirst = await limiter.checkRateLimit({
      route: ROUTE,
      subject: SUBJECT_B,
      rule: RULE_BURST,
    });
    expect(bFirst.allowed).toBe(true);
    expect(bFirst.failedOpen).toBe(false);
  });

  it("key có TTL > 0 và biến mất sau khi hết hạn", async () => {
    const limiter = new RateLimiter();
    // ei = 200ms → PX ≈ 200ms sau request đầu (burst=0). Dùng pTTL (ms) vì
    // TTL (giây) làm tròn xuống 0 với key sub-second → assert sai.
    const rule: RateLimitRule = { limit: 5, windowSec: 1, burst: 0 };
    const repo = new RedisRepository();
    const client = await getRedisClient();
    const key = buildRateLimitKey(ROUTE, SUBJECT_A.type, SUBJECT_A.id);

    await limiter.checkRateLimit({ route: ROUTE, subject: SUBJECT_A, rule });

    const pttl = await client.pTTL(key);
    expect(pttl).toBeGreaterThan(0);

    await sleep(pttl + 50);

    expect(await repo.exists(key)).toBe(false);
  });
});

describe("RateLimiter — EVALSHA / NOSCRIPT", () => {
  it("gọi lần đầu (EVALSHA chưa cache) → vẫn đúng", async () => {
    // Process có thể đã cache SHA từ test trước — vẫn phải trả decision hợp lệ.
    const limiter = new RateLimiter();
    const decision = await limiter.checkRateLimit({
      route: ROUTE,
      subject: SUBJECT_A,
      rule: RULE_BURST,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.failedOpen).toBe(false);
  });

  it("gọi lần 2+ → dùng SHA đã cache (scriptLoad/eval không gọi lại)", async () => {
    const limiter = new RateLimiter();

    // Warm: đảm bảo SHA đã nạp vào module cache.
    await limiter.checkRateLimit({ route: ROUTE, subject: SUBJECT_A, rule: RULE_BURST });

    const evalSpy = vi.spyOn(RedisRepository.prototype, "eval");
    const loadSpy = vi.spyOn(RedisRepository.prototype, "scriptLoad");
    const evalShaSpy = vi.spyOn(RedisRepository.prototype, "evalSha");

    const decision = await limiter.checkRateLimit({
      route: ROUTE,
      subject: SUBJECT_B,
      rule: RULE_BURST,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.failedOpen).toBe(false);
    expect(evalShaSpy).toHaveBeenCalled();
    expect(evalSpy).not.toHaveBeenCalled();
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("FLUSHALL giữa 2 lần gọi → tự phục hồi", async () => {
    const limiter = new RateLimiter();
    const client = await getRedisClient();

    const first = await limiter.checkRateLimit({
      route: ROUTE,
      subject: SUBJECT_A,
      rule: RULE_BURST,
    });
    expect(first.allowed).toBe(true);

    // Xoá data + script cache Redis — mô phỏng Redis restart.
    await client.flushAll();

    const second = await limiter.checkRateLimit({
      route: ROUTE,
      subject: SUBJECT_A,
      rule: RULE_BURST,
    });
    expect(second.allowed).toBe(true);
    expect(second.failedOpen).toBe(false);
  });
});

describe("RateLimiter — p0-01b review fixes (R19–R23)", () => {
  it("R19: rule ei = 0 không làm mất rate limit", async () => {
    const limiter = new RateLimiter();
    const client = await getRedisClient();
    const rule: RateLimitRule = { limit: 2000, windowSec: 1, burst: 100 };
    const key = buildRateLimitKey("p001b.r19", SUBJECT_A.type, SUBJECT_A.id);

    for (let i = 0; i < 3; i++) {
      const decision = await limiter.checkRateLimit({
        route: "p001b.r19",
        subject: SUBJECT_A,
        rule,
      });
      expect(decision.failedOpen).toBe(false);
    }

    // burst: 100 giữ key đủ lâu để đọc TTL. Không assert allowed — ei=1ms, timing quyết định deny.
    const pttl = await client.pTTL(key);
    expect(pttl).toBeGreaterThan(50);
  });

  it("R20: clamp ei trong Lua độc lập với clamp JS — lần 2 cùng now bị chặn", async () => {
    const repo = new RedisRepository();
    const now = String(Date.now());
    const key = "guard:r20:lua-clamp";

    const first = (await repo.eval(GCRA_LUA_SCRIPT, [key], ["0", "0", now])) as unknown[];
    const second = (await repo.eval(GCRA_LUA_SCRIPT, [key], ["0", "0", now])) as unknown[];

    expect(Number(first[0])).toBe(1);
    expect(Number(second[0])).toBe(0);
  });

  it("R21: remainingBurst khớp vector đã chốt [3, 2, 1, 0, 0] (Q2 = A, lower bound)", async () => {
    const limiter = new RateLimiter();
    const now = Date.now();
    const got: number[] = [];

    // nowMs cố định — loại rủi ro timing. Giá trị là lower bound có chủ đích;
    // canonical là +1. Đỏ ở đây = ai đó đã đổi công thức Lua — đọc Q2 của
    // p0-01b trước khi "sửa" test.
    for (let i = 0; i < 5; i++) {
      const d = await limiter.checkRateLimit({
        route: ROUTE,
        subject: SUBJECT_A,
        rule: RULE_BURST,
        nowMs: now,
      });
      expect(d.allowed).toBe(true);
      got.push(d.remainingBurst);
    }

    expect(got).toEqual([3, 2, 1, 0, 0]);
  });

  it("R22: nowMs sample sau getClient — args[2] >= tStart + 300", async () => {
    const limiter = new RateLimiter();
    let calls = 0;
    vi.spyOn(RedisRepository.prototype, "getClient").mockImplementation(async function (this: RedisRepository) {
      calls += 1;
      if (calls === 1) {
        await sleep(300);
      }
      return await getRedisClient();
    });

    let capturedNow: string | undefined;
    vi.spyOn(RedisRepository.prototype, "evalSha").mockImplementation(async function (
      this: RedisRepository,
      sha: string,
      keys: string[],
      args: string[],
    ) {
      capturedNow = args[2];
      const client = await this.getClient();
      return await client.evalSha(sha, { keys, arguments: args });
    });

    const tStart = Date.now();
    const decision = await limiter.checkRateLimit({
      route: "p001b.r22",
      subject: SUBJECT_A,
      rule: RULE_BURST,
    });

    expect(decision.failedOpen).toBe(false);
    expect(capturedNow).toBeDefined();
    expect(Number(capturedNow)).toBeGreaterThanOrEqual(tStart + 300);
  });

  it("R23: không deny oan sau connect chậm — allowed + failedOpen false", async () => {
    const limiter = new RateLimiter();
    const rule: RateLimitRule = { limit: 1, windowSec: 1, burst: 0 };
    const client = await getRedisClient();
    const key = buildRateLimitKey("p001b.r23", SUBJECT_A.type, SUBJECT_A.id);

    const first = await limiter.checkRateLimit({
      route: "p001b.r23",
      subject: SUBJECT_A,
      rule,
    });
    expect(first.allowed).toBe(true);
    expect(first.failedOpen).toBe(false);

    // PX mặc định = ei = 1000ms < delay 1200ms → key biến mất, cả code cũ lẫn mới
    // đều ALLOW (GET miss, TAT = ARGV now). Kéo TTL để giữ TAT — test mới chạm
    // đúng bug #4 (now cũ + TAT còn sống → deny oan).
    await client.pExpire(key, 10_000);

    let calls = 0;
    vi.spyOn(RedisRepository.prototype, "getClient").mockImplementation(async function (this: RedisRepository) {
      calls += 1;
      if (calls === 1) {
        await sleep(1200);
      }
      return await getRedisClient();
    });

    const second = await limiter.checkRateLimit({
      route: "p001b.r23",
      subject: SUBJECT_A,
      rule,
    });

    expect(second.allowed).toBe(true);
    expect(second.failedOpen).toBe(false);
  });
});
