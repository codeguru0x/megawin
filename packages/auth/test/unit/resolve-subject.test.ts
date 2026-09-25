/**
 * p1-01 B1 #1–#7 — resolve subject. Mock RateLimiter, không Redis.
 *
 * Key Redis do RateLimiter build từ subject. Test này kiểm subject đưa vào limiter
 * và key mà `buildRateLimitKey` sẽ tạo từ subject đó.
 */

import { buildRateLimitKey, GuardSubjectType } from "@megawin/guard";
import { logError } from "@megawin/shared/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { rateLimitMiddleware, resolveRateLimitSubject } from "../../src/rate-limit";

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

function allowedDecision() {
  return { allowed: true, retryAfterMs: 0, remainingBurst: 5, failedOpen: false };
}

beforeEach(() => {
  checkRateLimit.mockReset();
  checkRateLimit.mockResolvedValue(allowedDecision());
  vi.mocked(logError).mockClear();
  delete process.env.GUARD_RATELIMIT_MODE;
});

describe("resolveRateLimitSubject", () => {
  // #1
  it("subject account + accountId → dùng accountId, key chứa hash", async () => {
    const event = { user: { accountId: "acc-1" } };
    const subject = resolveRateLimitSubject(event, GuardSubjectType.Account);

    expect(subject).toEqual({ type: GuardSubjectType.Account, id: "acc-1" });
    const key = buildRateLimitKey("keno.place-bet", subject!.type, subject!.id);
    expect(key).toContain("account_");
    expect(key).not.toContain("acc-1");

    const mw = rateLimitMiddleware({ ...OPTIONS, subject: GuardSubjectType.Account });
    await mw.before({ event });
    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: { type: GuardSubjectType.Account, id: "acc-1" },
      }),
    );
  });

  // #2
  it("subject tenant + event.tenant.tenantId → dùng tenantId", () => {
    const subject = resolveRateLimitSubject({ tenant: { tenantId: "ten-1" } }, GuardSubjectType.Tenant);
    expect(subject).toEqual({ type: GuardSubjectType.Tenant, id: "ten-1" });
  });

  // #3 — không có event.tenant thì lấy event.user.tenantId.
  it("subject tenant không có event.tenant nhưng có user.tenantId", () => {
    const subject = resolveRateLimitSubject({ user: { tenantId: "ten-from-user" } }, GuardSubjectType.Tenant);
    expect(subject).toEqual({ type: GuardSubjectType.Tenant, id: "ten-from-user" });
  });

  // #4
  it("subject ip → sourceIp của API Gateway", () => {
    const subject = resolveRateLimitSubject(
      { requestContext: { http: { sourceIp: "203.0.113.10" } } },
      GuardSubjectType.Ip,
    );
    expect(subject).toEqual({ type: GuardSubjectType.Ip, id: "203.0.113.10" });
  });

  // #5 — gắn nhầm account lên handler không có identity: fallback IP + log.
  it("khai account nhưng không có accountId → fallback IP và logError", async () => {
    const event = { requestContext: { http: { sourceIp: "198.51.100.8" } } };
    const subject = resolveRateLimitSubject(event, GuardSubjectType.Account);

    expect(subject).toEqual({ type: GuardSubjectType.Ip, id: "198.51.100.8" });
    expect(logError).toHaveBeenCalled();

    const mw = rateLimitMiddleware(OPTIONS);
    await mw.before({ event });
    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: { type: GuardSubjectType.Ip, id: "198.51.100.8" },
      }),
    );
  });

  // #6 — không có IP thì bỏ qua, không chặn.
  it("không lấy được IP → không gọi rate limiter", async () => {
    const mw = rateLimitMiddleware({ ...OPTIONS, subject: GuardSubjectType.Ip });
    const request = { event: { requestContext: { http: {} } } };
    await mw.before(request);

    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalled();
    expect(request).not.toHaveProperty("earlyResponse");
  });

  // #7
  it("hai subject khác nhau → hai key khác nhau", () => {
    const accountKey = buildRateLimitKey("keno.place-bet", GuardSubjectType.Account, "acc-1");
    const ipKey = buildRateLimitKey("keno.place-bet", GuardSubjectType.Ip, "203.0.113.10");
    expect(accountKey).not.toBe(ipKey);
  });

  it("subject tenant ưu tiên event.tenant hơn user.tenantId", () => {
    const subject = resolveRateLimitSubject(
      { tenant: { tenantId: "ten-event" }, user: { tenantId: "ten-user" } },
      GuardSubjectType.Tenant,
    );
    expect(subject).toEqual({ type: GuardSubjectType.Tenant, id: "ten-event" });
  });

  it("khai tenant nhưng không có tenantId → fallback IP và logError", async () => {
    const event = { requestContext: { http: { sourceIp: "198.51.100.9" } } };
    const subject = resolveRateLimitSubject(event, GuardSubjectType.Tenant);

    expect(subject).toEqual({ type: GuardSubjectType.Ip, id: "198.51.100.9" });
    expect(logError).toHaveBeenCalled();

    const mw = rateLimitMiddleware({ ...OPTIONS, subject: GuardSubjectType.Tenant });
    await mw.before({ event });
    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: { type: GuardSubjectType.Ip, id: "198.51.100.9" },
      }),
    );
  });

  it("accountId rỗng → coi như thiếu identity, fallback IP", () => {
    const subject = resolveRateLimitSubject(
      { user: { accountId: "" }, requestContext: { http: { sourceIp: "203.0.113.11" } } },
      GuardSubjectType.Account,
    );
    expect(subject).toEqual({ type: GuardSubjectType.Ip, id: "203.0.113.11" });
    expect(logError).toHaveBeenCalled();
  });

  it("sourceIp chỉ khoảng trắng → bỏ qua rate limit", async () => {
    const mw = rateLimitMiddleware({ ...OPTIONS, subject: GuardSubjectType.Ip });
    const request = { event: { requestContext: { http: { sourceIp: "   " } } } };
    await mw.before(request);

    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalled();
    expect(request).not.toHaveProperty("earlyResponse");
  });
});
