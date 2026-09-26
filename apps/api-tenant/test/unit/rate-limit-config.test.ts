/**
 * p1-03 B0 (0b, 0c) + B1 #1–#7 — đặc thù api-tenant, mock limiter, không Redis.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { GuardSubjectType, resolveRateLimitSubject } from "@megawin/auth";
import { hashKeyPart } from "@megawin/cache";
import { buildRateLimitKey } from "@megawin/guard";
import { logError } from "@megawin/shared/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PLAYER_LOGIN_PER_PLAYER_RATE_LIMIT, PLAYER_LOGIN_PER_TENANT_RATE_LIMIT } from "../../src/lib/rate-limit";
import {
  FUNCTIONS_DIR,
  HANDLERS_DIR,
  listHandlerFiles,
  readReadme,
  readServerlessYml,
  scanDeployedFunctions,
  scanHandlerRateLimits,
} from "../helpers/scan-rate-limit";
import { createTenantHttpEvent, parseBody } from "../helpers/tenant-event";

const checkRateLimit = vi.hoisted(() => vi.fn());
const playerLoginRun = vi.hoisted(() => vi.fn());
const tenantsByKey = vi.hoisted(
  () => new Map<string, { tenantId: string; displayName: string; status: string; apiKey: string }>(),
);

vi.mock("@megawin/guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@megawin/guard")>();
  return {
    ...actual,
    RateLimiter: class {
      checkRateLimit = checkRateLimit;
    },
  };
});

vi.mock("@megawin/shared/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@megawin/shared/utils")>();
  return {
    ...actual,
    logError: vi.fn(),
  };
});

vi.mock("@megawin/identity-application/repos", () => ({
  TenantRepository: class {
    getTenantByApiKey = async (apiKey: string) => tenantsByKey.get(apiKey) ?? null;
  },
}));

vi.mock("@megawin/identity-application/use-cases/players", () => ({
  PlayerLoginUseCase: class {
    run = playerLoginRun;
  },
}));

const SUBJECT_VALUES = new Set(Object.values(GuardSubjectType));
const DEPLOYED_HANDLER_FILES = ["player-login.ts", "get-entry-feed.ts", "get-reports.ts"] as const;
const UNDEPLOYED_HANDLER_FILES = ["list-players.ts", "get-player-detail.ts", "suspend-player.ts"] as const;

const PLAN_ROUTES = {
  perTenant: "tenant.player-login",
  perPlayer: "tenant.player-login.player",
  feed: "tenant.bets-feed",
  revenue: "tenant.reports-revenue",
} as const;

function registerTenant(tenantId: string, apiKey = `key-${tenantId}`) {
  tenantsByKey.set(apiKey, { tenantId, displayName: tenantId, status: "active", apiKey });
  return apiKey;
}

function allowed() {
  return { allowed: true, retryAfterMs: 0, remainingBurst: 0, failedOpen: false };
}

function denied(retryAfterMs = 12_000) {
  return { allowed: false, retryAfterMs, remainingBurst: 0, failedOpen: false };
}

beforeEach(() => {
  checkRateLimit.mockReset();
  checkRateLimit.mockResolvedValue(allowed());
  playerLoginRun.mockReset();
  playerLoginRun.mockResolvedValue({ accessToken: "t", refreshToken: "r" });
  tenantsByKey.clear();
  vi.mocked(logError).mockClear();
  delete process.env.GUARD_RATELIMIT_MODE;
});

describe("p1-03 B0 — môi trường tĩnh", () => {
  it("0b REDIS_URI vẫn có trong serverless.yml — không tự thêm", () => {
    const yml = readServerlessYml();
    expect(yml).toMatch(/REDIS_URI:/);
    expect(yml).not.toMatch(/GUARD_RATELIMIT_MODE:\s*shadow/i);
  });

  it("0c đúng 3 handler được deploy; 3 handler còn lại không có httpApi", () => {
    const deployed = scanDeployedFunctions();
    expect(deployed.map((f) => f.handlerRel).toSorted()).toEqual(
      ["get-entry-feed", "get-reports", "player-login"].toSorted(),
    );
    expect(deployed).toHaveLength(3);
    expect(listHandlerFiles()).toEqual([...DEPLOYED_HANDLER_FILES, ...UNDEPLOYED_HANDLER_FILES].toSorted());

    const declared = scanHandlerRateLimits();
    expect(declared.map((d) => d.relPath).toSorted()).toEqual([...DEPLOYED_HANDLER_FILES].toSorted());
    for (const file of UNDEPLOYED_HANDLER_FILES) {
      const src = readFileSync(join(HANDLERS_DIR, file), "utf8");
      expect(src, file).not.toMatch(/rateLimit:/);
    }
  });

  it("tài liệu tích hợp đã có bảng ngưỡng + Retry-After — không retry ngay", () => {
    const readme = readReadme();
    expect(readme).toContain(PLAN_ROUTES.perTenant);
    expect(readme).toContain(PLAN_ROUTES.perPlayer);
    expect(readme).toContain(PLAN_ROUTES.feed);
    expect(readme).toContain(PLAN_ROUTES.revenue);
    expect(readme).toMatch(/Retry-After/);
    expect(readme).toMatch(/Không.*retry ngay/i);
    expect(readme).toMatch(/hasMore/);
    expect(readme).not.toMatch(/shadow/i);
  });
});

describe("p1-03 B1 — subject / key", () => {
  // #1 #3
  it("#1 #3 event.tenant.tenantId → key theo tenant, đã hash, không lộ tenantId", () => {
    const tenantId = "partner-acme-prod";
    const subject = resolveRateLimitSubject({ tenant: { tenantId } }, GuardSubjectType.Tenant);
    expect(subject).toEqual({ type: GuardSubjectType.Tenant, id: tenantId });

    const key = buildRateLimitKey(PLAN_ROUTES.perTenant, subject!.type, subject!.id);
    expect(key).toContain("tenant_");
    expect(key).toContain(hashKeyPart(tenantId));
    expect(key).not.toContain(tenantId);
    expect(key.startsWith("guard:rl:v1:")).toBe(true);
  });

  // #2
  it("#2 thiếu event.tenant → fallback IP + logError — không bỏ qua im lặng", () => {
    const event = { requestContext: { http: { sourceIp: "198.51.100.20" } } };
    const subject = resolveRateLimitSubject(event, GuardSubjectType.Tenant);

    expect(subject).toEqual({ type: GuardSubjectType.Ip, id: "198.51.100.20" });
    expect(logError).toHaveBeenCalled();
    const key = buildRateLimitKey(PLAN_ROUTES.perTenant, subject!.type, subject!.id);
    expect(key).toContain("ip_");
    expect(key).not.toContain("198.51.100.20");
  });

  it("thiếu tenant và không có IP → skip limiter (null), có log — không tự gây sự cố", () => {
    const subject = resolveRateLimitSubject({}, GuardSubjectType.Tenant);
    expect(subject).toBeNull();
    expect(logError).toHaveBeenCalled();
  });

  // #4
  it("#4 hai tenant → hai key; cùng tenant → cùng key", () => {
    const a = buildRateLimitKey(PLAN_ROUTES.perTenant, GuardSubjectType.Tenant, "tenant-a");
    const b = buildRateLimitKey(PLAN_ROUTES.perTenant, GuardSubjectType.Tenant, "tenant-b");
    const aAgain = buildRateLimitKey(PLAN_ROUTES.perTenant, GuardSubjectType.Tenant, "tenant-a");
    expect(a).not.toBe(b);
    expect(a).toBe(aAgain);
  });

  it("ngoài thiết kế: route chứa ':' phải throw — không phá tầng key", () => {
    expect(() => buildRateLimitKey("tenant:player-login", GuardSubjectType.Tenant, "t1")).toThrow(/:/);
  });
});

describe("p1-03 B1 — 2 lớp login", () => {
  // #5
  it("#5 Endpoint 1 gọi cả 2 lớp với 2 key khác nhau", async () => {
    registerTenant("ten-5");
    const { handler } = await import("../../src/handlers/player-login");
    const response = (await handler(
      createTenantHttpEvent({ tenantId: "ten-5", body: { playerExternalId: "plyr0001" } }) as never,
      {} as never,
    )) as { statusCode: number };

    expect(response.statusCode).toBe(200);
    expect(checkRateLimit).toHaveBeenCalledTimes(2);
    expect(playerLoginRun).toHaveBeenCalledTimes(1);

    const routes = checkRateLimit.mock.calls.map((c) => c[0].route);
    expect(routes).toEqual([PLAN_ROUTES.perTenant, PLAN_ROUTES.perPlayer]);

    const subjects = checkRateLimit.mock.calls.map((c) => c[0].subject);
    expect(subjects[0]).toEqual({ type: GuardSubjectType.Tenant, id: "ten-5" });
    expect(subjects[1]).toEqual({ type: GuardSubjectType.Tenant, id: "ten-5:plyr0001" });

    const keyTenant = buildRateLimitKey(
      subjects[0].type ? PLAN_ROUTES.perTenant : "",
      subjects[0].type,
      subjects[0].id,
    );
    const keyPlayer = buildRateLimitKey(PLAN_ROUTES.perPlayer, subjects[1].type, subjects[1].id);
    expect(keyTenant).not.toBe(keyPlayer);
    expect(keyPlayer).not.toContain("ten-5");
    expect(keyPlayer).not.toContain("plyr0001");
  });

  // #6 — 1 player xấu không chặn player khác: deny per-player không dùng chung bucket tenant.
  it("#6 per-player denied → use-case không chạy; player khác cùng tenant vẫn qua lớp player", async () => {
    registerTenant("ten-6");
    const { handler } = await import("../../src/handlers/player-login");

    const charges = { tenant: 0, player: 0 };
    checkRateLimit.mockImplementation(async (input: { route: string; subject: { id: string } }) => {
      if (input.route === PLAN_ROUTES.perPlayer) {
        if (input.subject.id.endsWith(":badplayer01")) {
          return denied();
        }
        charges.player += 1;
        return allowed();
      }
      if (input.route === PLAN_ROUTES.perTenant) {
        charges.tenant += 1;
        return allowed();
      }
      throw new Error(`route ngoài thiết kế: ${input.route}`);
    });

    const deniedRes = (await handler(
      createTenantHttpEvent({ tenantId: "ten-6", body: { playerExternalId: "badplayer01" } }) as never,
      {} as never,
    )) as { statusCode: number; body: string; headers: Record<string, string> };

    expect(deniedRes.statusCode).toBe(429);
    expect(parseBody(deniedRes).error?.code).toBe("TOO_MANY_REQUESTS");
    expect(deniedRes.headers["Retry-After"]).toBeDefined();
    expect(playerLoginRun).not.toHaveBeenCalled();
    expect(charges.tenant).toBe(1);
    expect(charges.player).toBe(0);

    const ok = (await handler(
      createTenantHttpEvent({ tenantId: "ten-6", body: { playerExternalId: "goodplayer1" } }) as never,
      {} as never,
    )) as { statusCode: number };
    expect(ok.statusCode).toBe(200);
    expect(playerLoginRun).toHaveBeenCalledTimes(1);
    expect(charges.player).toBe(1);

    const playerIds = checkRateLimit.mock.calls
      .filter((c) => c[0].route === PLAN_ROUTES.perPlayer)
      .map((c) => c[0].subject.id);
    expect(playerIds).toEqual(["ten-6:badplayer01", "ten-6:goodplayer1"]);
  });

  it("van off → không gọi Redis/limiter, use-case vẫn chạy", async () => {
    process.env.GUARD_RATELIMIT_MODE = "off";
    registerTenant("ten-off");
    const { handler } = await import("../../src/handlers/player-login");
    const response = (await handler(
      createTenantHttpEvent({ tenantId: "ten-off", body: { playerExternalId: "plyr0002" } }) as never,
      {} as never,
    )) as { statusCode: number };

    expect(response.statusCode).toBe(200);
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(playerLoginRun).toHaveBeenCalledTimes(1);
  });

  it("giá trị rác GUARD_RATELIMIT_MODE → vẫn enforce (không tắt im lặng)", async () => {
    process.env.GUARD_RATELIMIT_MODE = "shadow";
    registerTenant("ten-garbage");
    const { handler } = await import("../../src/handlers/player-login");
    await handler(
      createTenantHttpEvent({ tenantId: "ten-garbage", body: { playerExternalId: "plyr0003" } }) as never,
      {} as never,
    );
    expect(checkRateLimit).toHaveBeenCalled();
    expect(logError).toHaveBeenCalled();
  });

  it("body Zod fail → 400, không gọi use-case; per-player không chạy (chưa có playerExternalId hợp lệ)", async () => {
    registerTenant("ten-zod");
    const { handler } = await import("../../src/handlers/player-login");
    const response = (await handler(
      createTenantHttpEvent({ tenantId: "ten-zod", body: { playerExternalId: "ab" } }) as never,
      {} as never,
    )) as { statusCode: number };

    expect(response.statusCode).toBe(400);
    expect(playerLoginRun).not.toHaveBeenCalled();
    expect(checkRateLimit).toHaveBeenCalledTimes(1);
    expect(checkRateLimit.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ route: PLAN_ROUTES.perTenant }));
  });

  it("thiếu API key → 401 trước rate-limit", async () => {
    const { handler } = await import("../../src/handlers/player-login");
    const response = (await handler(
      createTenantHttpEvent({ tenantId: "ten-401", body: { playerExternalId: "plyr0004" }, omitApiKey: true }) as never,
      {} as never,
    )) as { statusCode: number };

    expect(response.statusCode).toBe(401);
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(playerLoginRun).not.toHaveBeenCalled();
  });
});

describe("p1-03 B1 #7 — route / số đã chốt", () => {
  it("#7 3 endpoint route duy nhất, đúng số; login 2 lớp đúng rule", () => {
    const declared = scanHandlerRateLimits();
    expect(declared).toHaveLength(3);
    expect(new Set(declared.map((d) => d.route)).size).toBe(3);

    const login = declared.find((d) => d.fileName === "player-login");
    const feed = declared.find((d) => d.fileName === "get-entry-feed");
    const revenue = declared.find((d) => d.fileName === "get-reports");

    expect(login).toMatchObject({
      route: PLAN_ROUTES.perTenant,
      limit: 10,
      windowSec: 1,
      burst: 20,
      subject: GuardSubjectType.Tenant,
      usesPerTenantConstant: true,
    });
    expect(feed).toMatchObject({
      route: PLAN_ROUTES.feed,
      limit: 3,
      windowSec: 60,
      burst: 2,
      subject: GuardSubjectType.Tenant,
    });
    expect(revenue).toMatchObject({
      route: PLAN_ROUTES.revenue,
      limit: 20,
      windowSec: 60,
      subject: GuardSubjectType.Tenant,
    });

    expect(PLAYER_LOGIN_PER_PLAYER_RATE_LIMIT).toEqual({
      route: PLAN_ROUTES.perPlayer,
      limit: 1,
      windowSec: 5,
      burst: 0,
    });
    expect(PLAYER_LOGIN_PER_TENANT_RATE_LIMIT.subject).toBe(GuardSubjectType.Tenant);
    expect(PLAYER_LOGIN_PER_PLAYER_RATE_LIMIT.route).not.toBe(PLAYER_LOGIN_PER_TENANT_RATE_LIMIT.route);

    for (const item of declared) {
      expect(SUBJECT_VALUES.has(item.subject as GuardSubjectType), item.relPath).toBe(true);
      expect(item.limit).toBeGreaterThan(0);
      expect(item.windowSec).toBeGreaterThan(0);
      expect(item.route).not.toContain(":");
    }
  });

  it("login source dùng hằng chia sẻ, không literal rải; không còn shadow", () => {
    const src = readFileSync(join(HANDLERS_DIR, "player-login.ts"), "utf8");
    expect(src).toContain("PLAYER_LOGIN_PER_TENANT_RATE_LIMIT");
    expect(src).toContain("PLAYER_LOGIN_PER_PLAYER_RATE_LIMIT");
    expect(src).not.toMatch(/shadow/i);
    expect(src).toMatch(/playerExternalId/);

    for (const name of ["player-endpoint.yml", "entry-feed-endpoint.yml", "report-endpoint.yml"]) {
      const yml = readFileSync(join(FUNCTIONS_DIR, name), "utf8");
      expect(yml, name).not.toMatch(/shadow/i);
    }
  });
});
