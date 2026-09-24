/**
 * p1-01 B1 #26–#29 — thứ tự chain: auth → rateLimit → validatorZod.
 */

import { GuardSubjectType } from "@megawin/guard";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  buildHandler,
  withAgentAuth,
  withCompanyAuth,
  withPlayerAuth,
  withPublicHandler,
} from "../../src/handler-wrappers";
import { withTenantAuth } from "../../src/tenant/with-tenant-auth";

const calls = vi.hoisted(() => [] as string[]);
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

vi.mock("../../src/authorization-middleware", () => ({
  playerAuth: () => ({
    before: async () => {
      calls.push("auth");
    },
  }),
  agentAuth: () => ({
    before: async () => {
      calls.push("auth");
    },
  }),
  companyAuth: () => ({
    before: async () => {
      calls.push("auth");
    },
  }),
}));

vi.mock("../../src/tenant/tenant-auth", () => ({
  tenantAuth: () => ({
    before: async () => {
      calls.push("auth");
    },
  }),
}));

vi.mock("@megawin/app-core/lambda/middleware", async () => {
  const actual = await vi.importActual<typeof import("@megawin/app-core/lambda/middleware")>(
    "@megawin/app-core/lambda/middleware",
  );
  return {
    ...actual,
    validatorZodMiddleware: (schemas: never) => {
      const inner = actual.validatorZodMiddleware(schemas);
      return {
        ...inner,
        before: async (request: never) => {
          calls.push("validatorZod");
          return inner.before(request);
        },
      };
    },
  };
});

const RATE = {
  route: "keno.place-bet",
  limit: 30,
  windowSec: 60,
  subject: GuardSubjectType.Account,
};

const EVENT = {
  user: { accountId: "acc-chain" },
  tenant: { tenantId: "ten-chain" },
  body: JSON.stringify({ n: 1 }),
  headers: { "content-type": "application/json" },
  requestContext: { http: { method: "POST", sourceIp: "203.0.113.9" } },
};

const bodySchema = z.object({ n: z.number() });

beforeEach(() => {
  calls.length = 0;
  checkRateLimit.mockReset();
  checkRateLimit.mockImplementation(async () => {
    calls.push("rateLimit");
    return { allowed: true, retryAfterMs: 0, remainingBurst: 1, failedOpen: false };
  });
  delete process.env.GUARD_RATELIMIT_MODE;
});

describe("chain order", () => {
  // #26
  it("thứ tự auth → rateLimit → validatorZod", async () => {
    const handler = vi.fn(async () => {
      calls.push("handler");
      return { ok: true };
    });
    const wrapped = buildHandler(handler, {
      auth: {
        before: async () => {
          calls.push("auth");
        },
      },
      rateLimit: RATE,
      schemas: { body: bodySchema },
    });

    await wrapped(EVENT, {} as never);

    expect(calls).toEqual(["auth", "rateLimit", "validatorZod", "handler"]);
  });

  // #27
  it("enforce + denied → validatorZod không chạy", async () => {
    checkRateLimit.mockImplementation(async () => {
      calls.push("rateLimit");
      return { allowed: false, retryAfterMs: 1000, remainingBurst: 0, failedOpen: false };
    });
    const handler = vi.fn(async () => ({ ok: true }));
    const wrapped = buildHandler(handler, {
      auth: {
        before: async () => {
          calls.push("auth");
        },
      },
      rateLimit: RATE,
      schemas: { body: bodySchema },
    });

    await wrapped(EVENT, {} as never);

    expect(calls).toEqual(["auth", "rateLimit"]);
    expect(handler).not.toHaveBeenCalled();
  });

  // #28 — cả 5 wrapper phải truyền rateLimit vào chain.
  it("5 wrapper đều gọi rate limiter khi khai rateLimit", async () => {
    const handlers = [
      withPlayerAuth(async () => ({ ok: true }), { rateLimit: { ...RATE, subject: GuardSubjectType.Account } }),
      withAgentAuth(async () => ({ ok: true }), { rateLimit: { ...RATE, subject: GuardSubjectType.Account } }),
      withCompanyAuth(async () => ({ ok: true }), { rateLimit: { ...RATE, subject: GuardSubjectType.Account } }),
      withTenantAuth(async () => ({ ok: true }), { rateLimit: { ...RATE, subject: GuardSubjectType.Tenant } }),
      withPublicHandler(async () => ({ ok: true }), { rateLimit: { ...RATE, subject: GuardSubjectType.Ip } }),
    ];

    for (const wrapped of handlers) {
      checkRateLimit.mockClear();
      await wrapped(EVENT, {} as never);
      expect(checkRateLimit).toHaveBeenCalledTimes(1);
    }
  });

  // #29
  it("không khai rateLimit → response vẫn 200 như chain cũ", async () => {
    const wrapped = withPublicHandler(async () => ({ ok: true }));
    const response = (await wrapped(EVENT, {} as never)) as { statusCode: number; body: string };

    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ success: true, data: { ok: true } });
  });
});
