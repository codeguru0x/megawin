/**
 * p1-01 B1 #18–#25 — body 429 đúng envelope, Retry-After là giây làm tròn lên.
 */

import { GuardSubjectType } from "@megawin/guard";
import { APP_ERROR_CODES } from "@megawin/shared/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { rateLimitMiddleware } from "../../src/rate-limit";

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
  return { ...actual, logError: vi.fn() };
});

const OPTIONS = {
  route: "keno.place-bet",
  limit: 30,
  windowSec: 60,
  subject: GuardSubjectType.Account,
};

const EVENT = { user: { accountId: "acc-429" } };

async function deny(retryAfterMs: number) {
  checkRateLimit.mockResolvedValue({
    allowed: false,
    retryAfterMs,
    remainingBurst: 0,
    failedOpen: false,
  });
  const request: {
    event: unknown;
    earlyResponse?: { statusCode: number; headers: Record<string, string>; body: string };
  } = { event: EVENT };
  await rateLimitMiddleware(OPTIONS).before(request);
  return request.earlyResponse!;
}

beforeEach(() => {
  checkRateLimit.mockReset();
  delete process.env.GUARD_RATELIMIT_MODE;
});

describe("429 response", () => {
  // #18 #19 #20 #23 #24 #25
  it("envelope lồng, code TOO_MANY_REQUESTS, status 429, không details", async () => {
    const response = await deny(1500);
    const body = JSON.parse(response.body) as {
      success: boolean;
      error: { code: string; message: string; details?: unknown };
    };

    expect(response.statusCode).toBe(429);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe(APP_ERROR_CODES.TOO_MANY_REQUESTS);
    expect(body.error.code).not.toBe("UNKNOWN");
    expect(body.error.details).toBeUndefined();
    expect(response.headers["Content-Type"]).toBe("application/json");
    expect(body.error.message).toBe("Bạn đang thao tác quá nhanh, vui lòng thử lại sau ít giây.");
    expect(body.error.message).not.toMatch(/limit|route|RateLimiter|\d+\/\d+/);
  });

  // #21 — 1500ms làm tròn lên thành 2 giây.
  it("retryAfterMs 1500 → Retry-After 2", async () => {
    const response = await deny(1500);
    expect(response.headers["Retry-After"]).toBe("2");
  });

  // #22 — dưới 1 giây vẫn tối thiểu 1, tránh client retry ngay.
  it("retryAfterMs 100 → Retry-After 1", async () => {
    const response = await deny(100);
    expect(response.headers["Retry-After"]).toBe("1");
  });

  it("retryAfterMs 0 hoặc âm → Retry-After vẫn 1", async () => {
    expect((await deny(0)).headers["Retry-After"]).toBe("1");
    expect((await deny(-50)).headers["Retry-After"]).toBe("1");
  });

  it("retryAfterMs đúng 1000 → Retry-After 1; 2000 → 2", async () => {
    expect((await deny(1000)).headers["Retry-After"]).toBe("1");
    expect((await deny(2000)).headers["Retry-After"]).toBe("2");
    expect((await deny(2001)).headers["Retry-After"]).toBe("3");
  });

  it("body.error không chứa route / limit / class name", async () => {
    const response = await deny(1500);
    const raw = response.body;
    expect(raw).not.toMatch(/keno\.place-bet/);
    expect(raw).not.toMatch(/RateLimiter/);
    expect(raw).not.toMatch(/30\/60/);
    expect(JSON.parse(raw).error).not.toHaveProperty("details");
  });
});
