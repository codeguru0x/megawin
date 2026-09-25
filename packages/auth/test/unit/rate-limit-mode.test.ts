/**
 * p1-01 B1 #8–#17 — mode enforce / off. Không có shadow.
 */

import { GuardSubjectType } from "@megawin/guard";
import { logError } from "@megawin/shared/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildHandler } from "../../src/handler-wrappers";
import { rateLimitMiddleware, RateLimitMode, resolveRateLimitMode } from "../../src/rate-limit";

const checkRateLimit = vi.hoisted(() => vi.fn());

vi.mock("@megawin/guard", async () => {
  const actual = await vi.importActual<typeof import("@megawin/guard")>("@megawin/guard");
  return {
    ...actual,
    RateLimiter: class {
      checkRateLimit = checkRateLimit;
    },
  };
});

vi.mock("@megawin/shared/utils", async () => {
  const actual = await vi.importActual<typeof import("@megawin/shared/utils")>("@megawin/shared/utils");
  return {
    ...actual,
    logError: vi.fn(),
  };
});

const OPTIONS = {
  route: "keno.place-bet",
  limit: 30,
  windowSec: 60,
  burst: 5,
  subject: GuardSubjectType.Account,
};

const EVENT = {
  user: { accountId: "acc-mode" },
  headers: {},
  requestContext: { http: { sourceIp: "203.0.113.5" } },
};

function denied(retryAfterMs = 1500) {
  return { allowed: false, retryAfterMs, remainingBurst: 0, failedOpen: false };
}

beforeEach(() => {
  checkRateLimit.mockReset();
  vi.mocked(logError).mockClear();
  delete process.env.GUARD_RATELIMIT_MODE;
});

describe("rate limit mode", () => {
  // #8
  it("enforce + denied → earlyResponse 429, handler không chạy", async () => {
    checkRateLimit.mockResolvedValue(denied());
    const handler = vi.fn(async () => ({ ok: true }));
    const wrapped = buildHandler(handler, { rateLimit: OPTIONS });

    const response = await wrapped(EVENT, {} as never);

    expect(handler).not.toHaveBeenCalled();
    expect(response).toMatchObject({ statusCode: 429 });
  });

  // #9
  it("enforce + allowed → handler được gọi", async () => {
    checkRateLimit.mockResolvedValue({ allowed: true, retryAfterMs: 0, remainingBurst: 4, failedOpen: false });
    const handler = vi.fn(async () => ({ ok: true }));
    const wrapped = buildHandler(handler, { rateLimit: OPTIONS });

    await wrapped(EVENT, {} as never);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  // #10
  it("enforce + denied → log đủ route, subjectType, decision", async () => {
    checkRateLimit.mockResolvedValue(denied());
    const mw = rateLimitMiddleware(OPTIONS);
    await mw.before({ event: EVENT });

    expect(logError).toHaveBeenCalledWith(
      "rateLimit.denied",
      expect.any(Error),
      expect.objectContaining({
        route: "keno.place-bet",
        subjectType: GuardSubjectType.Account,
        decision: expect.objectContaining({
          allowed: false,
          retryAfterMs: 1500,
          failedOpen: false,
        }),
      }),
    );
  });

  // #11
  it("off → rate limiter không được gọi", async () => {
    process.env.GUARD_RATELIMIT_MODE = RateLimitMode.Off;
    const mw = rateLimitMiddleware(OPTIONS);
    await mw.before({ event: EVENT });
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  // #12
  it("không khai rateLimit → rate limiter không được gọi", async () => {
    const handler = vi.fn(async () => ({ ok: true }));
    const wrapped = buildHandler(handler, {});
    await wrapped(EVENT, {} as never);
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  // #13
  it("không có env → mode mặc định enforce", () => {
    expect(resolveRateLimitMode(undefined)).toBe(RateLimitMode.Enforce);
    expect(resolveRateLimitMode("")).toBe(RateLimitMode.Enforce);
  });

  // #14
  it("GUARD_RATELIMIT_MODE=off đổi được mode", async () => {
    process.env.GUARD_RATELIMIT_MODE = "off";
    expect(resolveRateLimitMode(process.env.GUARD_RATELIMIT_MODE)).toBe(RateLimitMode.Off);
    const mw = rateLimitMiddleware(OPTIONS);
    await mw.before({ event: EVENT });
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  // #15
  it("env rác → fallback enforce và logError", async () => {
    process.env.GUARD_RATELIMIT_MODE = "enfore";
    expect(resolveRateLimitMode("enfore")).toBe(RateLimitMode.Enforce);
    expect(logError).toHaveBeenCalled();

    checkRateLimit.mockResolvedValue(denied());
    const handler = vi.fn(async () => ({ ok: true }));
    const wrapped = buildHandler(handler, { rateLimit: OPTIONS });
    const response = await wrapped(EVENT, {} as never);
    expect(response).toMatchObject({ statusCode: 429 });
    expect(handler).not.toHaveBeenCalled();
  });

  // #16 — shadow không phải mode. Typo/copy cũ bị coi là rác → enforce.
  it("env shadow bị coi là rác → enforce", () => {
    expect(resolveRateLimitMode("shadow")).toBe(RateLimitMode.Enforce);
    expect(logError).toHaveBeenCalled();
  });

  // #17 — Redis chết (failedOpen) vẫn cho qua kể cả enforce.
  it("failedOpen true → handler vẫn được gọi", async () => {
    checkRateLimit.mockResolvedValue({
      allowed: false,
      retryAfterMs: 0,
      remainingBurst: 0,
      failedOpen: true,
    });
    const handler = vi.fn(async () => ({ ok: true }));
    const wrapped = buildHandler(handler, { rateLimit: OPTIONS });
    await wrapped(EVENT, {} as never);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("RateLimitMode chỉ có enforce và off — không có shadow", () => {
    expect(Object.values(RateLimitMode).toSorted()).toEqual(["enforce", "off"]);
    expect(RateLimitMode).not.toHaveProperty("Shadow");
    expect(RateLimitMode).not.toHaveProperty("shadow");
  });

  it("env viết hoa / có khoảng trắng → rác → enforce + log", () => {
    expect(resolveRateLimitMode("ENFORCE")).toBe(RateLimitMode.Enforce);
    expect(resolveRateLimitMode("Off")).toBe(RateLimitMode.Enforce);
    expect(resolveRateLimitMode(" off ")).toBe(RateLimitMode.Enforce);
    expect(logError).toHaveBeenCalled();
  });
});
