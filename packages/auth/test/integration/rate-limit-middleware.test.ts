/**
 * p1-01 B2 #30–#36 — Redis 8.6 thật, handler giả.
 *
 * `flushDb()` trong beforeEach. Không bật rate limit trên handler production.
 */

import { DEFAULT_REDIS_CONNECT_DEADLINE_MS } from "@megawin/cache";
import { getRedisClient, RedisRepository } from "@megawin/cache/redis";
import { GuardSubjectType } from "@megawin/guard";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildHandler } from "../../src/handler-wrappers";
import type { HandlerRateLimitOptions } from "../../src/rate-limit";

function rule(route: string, subject: GuardSubjectType): HandlerRateLimitOptions {
  return { route, limit: 2, windowSec: 60, burst: 1, subject };
}

function eventFor(accountId: string) {
  return {
    user: { accountId },
    body: "{}",
    headers: {},
    requestContext: { http: { method: "POST", sourceIp: "203.0.113.20" } },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

beforeEach(async () => {
  delete process.env.GUARD_RATELIMIT_MODE;
  const client = await getRedisClient();
  await client.flushDb();
});

describe("rate limit middleware — Redis thật", () => {
  // #30
  it("#30 vượt ngưỡng → 429", async () => {
    const handler = vi.fn(async () => ({ ok: true }));
    const wrapped = buildHandler(handler, {
      rateLimit: rule("p101.place-bet", GuardSubjectType.Account),
    });
    const event = eventFor("acc-30");

    const first = (await wrapped(event, {} as never)) as { statusCode: number };
    const second = (await wrapped(event, {} as never)) as { statusCode: number };
    const third = (await wrapped(event, {} as never)) as { statusCode: number; headers: Record<string, string> };

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(third.statusCode).toBe(429);
    expect(third.headers["Retry-After"]).toBeDefined();
  });

  // #31 — window ngắn để sleep đúng Retry-After, không chờ 60s.
  it("#31 sau Retry-After giây thì 200 lại", async () => {
    const handler = vi.fn(async () => ({ ok: true }));
    const wrapped = buildHandler(handler, {
      rateLimit: {
        route: "p101.retry",
        limit: 5,
        windowSec: 1,
        burst: 0,
        subject: GuardSubjectType.Account,
      },
    });
    const event = eventFor("acc-31");

    const ok = (await wrapped(event, {} as never)) as { statusCode: number };
    expect(ok.statusCode).toBe(200);

    const denied = (await wrapped(event, {} as never)) as { statusCode: number; headers: Record<string, string> };
    expect(denied.statusCode).toBe(429);
    const seconds = Number(denied.headers["Retry-After"]);
    expect(seconds).toBeGreaterThanOrEqual(1);

    await sleep(seconds * 1000 + 50);
    const again = (await wrapped(event, {} as never)) as { statusCode: number };
    expect(again.statusCode).toBe(200);
  });

  // #32 #33 — lệnh Redis ném lỗi → fail-open, handler 200, không chờ hết deadline connect.
  it("#32 #33 Redis lệnh lỗi → 200 và latency dưới deadline connect", async () => {
    const evalSha = vi.spyOn(RedisRepository.prototype, "evalSha").mockRejectedValue(new Error("ECONNREFUSED"));
    const evalCmd = vi.spyOn(RedisRepository.prototype, "eval").mockRejectedValue(new Error("ECONNREFUSED"));

    const handler = vi.fn(async () => ({ ok: true }));
    const wrapped = buildHandler(handler, {
      rateLimit: rule("p101.fail-open", GuardSubjectType.Account),
    });

    const started = Date.now();
    const response = (await wrapped(eventFor("acc-32"), {} as never)) as { statusCode: number };
    const elapsed = Date.now() - started;

    // Spy phải chạy — 200 mà không gọi Redis nghĩa là middleware đã bỏ qua limiter.
    expect(evalSha).toHaveBeenCalled();
    expect(response.statusCode).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    // Lệnh Redis reject ngay: fail-open không được chờ hết deadline connect (5000ms).
    expect(elapsed).toBeLessThan(DEFAULT_REDIS_CONNECT_DEADLINE_MS);

    evalSha.mockRestore();
    evalCmd.mockRestore();
  });

  // #34
  it("#34 hai subject độc lập: A 429, B vẫn 200", async () => {
    const wrapped = buildHandler(async () => ({ ok: true }), {
      rateLimit: rule("p101.subject", GuardSubjectType.Account),
    });

    await wrapped(eventFor("acc-a"), {} as never);
    await wrapped(eventFor("acc-a"), {} as never);
    const deniedA = (await wrapped(eventFor("acc-a"), {} as never)) as { statusCode: number };
    const allowedB = (await wrapped(eventFor("acc-b"), {} as never)) as { statusCode: number };

    expect(deniedA.statusCode).toBe(429);
    expect(allowedB.statusCode).toBe(200);
  });

  // #35
  it("#35 hai route cùng subject độc lập", async () => {
    const placeBet = buildHandler(async () => ({ ok: true }), {
      rateLimit: rule("p101.place-bet-iso", GuardSubjectType.Account),
    });
    const listTickets = buildHandler(async () => ({ ok: true }), {
      rateLimit: rule("p101.list-tickets", GuardSubjectType.Account),
    });
    const event = eventFor("acc-35");

    await placeBet(event, {} as never);
    await placeBet(event, {} as never);
    const denied = (await placeBet(event, {} as never)) as { statusCode: number };
    const allowed = (await listTickets(event, {} as never)) as { statusCode: number };

    expect(denied.statusCode).toBe(429);
    expect(allowed.statusCode).toBe(200);
  });

  // #36 — off không gọi Redis (evalSha/eval không tăng).
  it("#36 mode off vượt ngưỡng vẫn 200 và không gọi eval", async () => {
    process.env.GUARD_RATELIMIT_MODE = "off";
    const evalSha = vi.spyOn(RedisRepository.prototype, "evalSha");
    const evalCmd = vi.spyOn(RedisRepository.prototype, "eval");

    const wrapped = buildHandler(async () => ({ ok: true }), {
      rateLimit: rule("p101.off", GuardSubjectType.Account),
    });
    const event = eventFor("acc-36");

    for (let i = 0; i < 5; i++) {
      const response = (await wrapped(event, {} as never)) as { statusCode: number };
      expect(response.statusCode).toBe(200);
    }

    expect(evalSha).not.toHaveBeenCalled();
    expect(evalCmd).not.toHaveBeenCalled();
    evalSha.mockRestore();
    evalCmd.mockRestore();
  });
});
