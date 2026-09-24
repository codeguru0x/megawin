/**
 * RateLimiter fail-open — file quan trọng nhất của p0-01 (B2 #23–#27).
 *
 * `redisEnvKey` trỏ env riêng (`REDIS_URI_BROKEN`) — không sửa `REDIS_URI`,
 * không tạo/sửa `.env*`.
 */

import { DEFAULT_REDIS_CONNECT_DEADLINE_MS } from "@megawin/cache";
import { getRedisClient, RedisRepository } from "@megawin/cache/redis";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildRateLimitKey } from "../../src/keys";
import { RateLimiter } from "../../src/rate-limit/rate-limiter";
import { GuardSubjectType, type RateLimitRule } from "../../src/types";

/** Env key riêng — trỏ port đóng, không đụng REDIS_URI sống. */
const BROKEN_ENV_KEY = "REDIS_URI_BROKEN";

const ROUTE = "keno.place-bet";
const SUBJECT = { type: GuardSubjectType.Ip, id: "203.0.113.99" } as const;
const RULE: RateLimitRule = { limit: 5, windowSec: 60, burst: 4 };

beforeEach(async () => {
  const client = await getRedisClient();
  await client.flushDb();
  process.env[BROKEN_ENV_KEY] = "redis://127.0.0.1:6399";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RateLimiter — fail-open khi Redis chết", () => {
  it("Redis không tới được → {allowed: true, failedOpen: true}", async () => {
    const limiter = new RateLimiter({ redisEnvKey: BROKEN_ENV_KEY });

    await expect(limiter.checkRateLimit({ route: ROUTE, subject: SUBJECT, rule: RULE })).resolves.toMatchObject({
      allowed: true,
      failedOpen: true,
    });
  });

  it("lời gọi hoàn thành nhanh (< DEFAULT_REDIS_CONNECT_DEADLINE_MS)", async () => {
    // Env key riêng để đo connect lần đầu (chưa circuit open từ test khác).
    const envKey = `${BROKEN_ENV_KEY}_DEADLINE_${Date.now()}`;
    process.env[envKey] = "redis://127.0.0.1:6399";
    const limiter = new RateLimiter({ redisEnvKey: envKey });

    const started = Date.now();
    const decision = await limiter.checkRateLimit({
      route: ROUTE,
      subject: SUBJECT,
      rule: RULE,
    });
    const elapsed = Date.now() - started;

    expect(decision.allowed).toBe(true);
    expect(decision.failedOpen).toBe(true);
    expect(elapsed).toBeLessThan(DEFAULT_REDIS_CONNECT_DEADLINE_MS);
  });

  it("lời gọi thứ 2 nhanh hơn rõ rệt (< 50ms) nhờ circuit", async () => {
    const envKey = `${BROKEN_ENV_KEY}_CIRCUIT_${Date.now()}`;
    process.env[envKey] = "redis://127.0.0.1:6399";
    const limiter = new RateLimiter({ redisEnvKey: envKey });

    const t0 = Date.now();
    await limiter.checkRateLimit({ route: ROUTE, subject: SUBJECT, rule: RULE });
    const firstMs = Date.now() - t0;

    const t1 = Date.now();
    const second = await limiter.checkRateLimit({
      route: ROUTE,
      subject: SUBJECT,
      rule: RULE,
    });
    const secondMs = Date.now() - t1;

    expect(second.failedOpen).toBe(true);
    expect(firstMs).toBeGreaterThan(0);
    expect(secondMs).toBeLessThan(50);
    expect(secondMs).toBeLessThan(firstMs);
  });
});

describe("RateLimiter — failedOpen phân biệt chặn thật", () => {
  it("Redis sống: failedOpen luôn false (cả khi allowed: false)", async () => {
    const limiter = new RateLimiter();

    for (let i = 0; i < RULE.limit; i++) {
      const ok = await limiter.checkRateLimit({ route: ROUTE, subject: SUBJECT, rule: RULE });
      expect(ok.failedOpen).toBe(false);
    }

    const denied = await limiter.checkRateLimit({
      route: ROUTE,
      subject: SUBJECT,
      rule: RULE,
    });
    expect(denied.allowed).toBe(false);
    expect(denied.failedOpen).toBe(false);
  });

  it("Redis trả reply sai shape → fail-open, không crash", async () => {
    const limiter = new RateLimiter();
    const key = buildRateLimitKey(ROUTE, SUBJECT.type, SUBJECT.id);

    // Warm connect + SHA trước khi spy.
    await limiter.checkRateLimit({
      route: ROUTE,
      subject: { type: GuardSubjectType.Ip, id: "warm-only" },
      rule: RULE,
    });

    // Ghi rác kiểu WRONGTYPE vào key (hash thay string) + spy reply rác —
    // hẹp đúng nhánh parseDecision / catch, không TypeError ra ngoài.
    const repo = new RedisRepository();
    await repo.hIncrBy(key, "garbage", 1);

    vi.spyOn(RedisRepository.prototype, "evalSha").mockResolvedValue("not-an-array" as unknown);
    vi.spyOn(RedisRepository.prototype, "eval").mockResolvedValue({ bad: true } as unknown);

    const decision = await limiter.checkRateLimit({
      route: ROUTE,
      subject: SUBJECT,
      rule: RULE,
    });

    expect(decision).toEqual({
      allowed: true,
      retryAfterMs: 0,
      remainingBurst: 0,
      failedOpen: true,
    });
  });
});

describe("RateLimiter — fail-open object identity (p0-01b R24–R25)", () => {
  it("R24: fail-open trả object mới mỗi lần (không shared reference)", async () => {
    const limiter = new RateLimiter({ redisEnvKey: BROKEN_ENV_KEY });

    const a = await limiter.checkRateLimit({ route: ROUTE, subject: SUBJECT, rule: RULE });
    const b = await limiter.checkRateLimit({ route: ROUTE, subject: SUBJECT, rule: RULE });

    expect(a).not.toBe(b);
    expect(a).toEqual(b);
    expect(a).toEqual({ allowed: true, retryAfterMs: 0, remainingBurst: 0, failedOpen: true });
  });

  it("R25: mutate decision không làm bẩn lời gọi sau", async () => {
    const limiter = new RateLimiter({ redisEnvKey: BROKEN_ENV_KEY });

    const first = await limiter.checkRateLimit({ route: ROUTE, subject: SUBJECT, rule: RULE });
    first.remainingBurst = 99;

    const second = await limiter.checkRateLimit({ route: ROUTE, subject: SUBJECT, rule: RULE });
    expect(second.remainingBurst).toBe(0);
    expect(second.failedOpen).toBe(true);
  });
});
