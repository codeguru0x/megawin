/**
 * p1-03 B0 0a + B2 #8–#13 — Redis 8.6 thật, cô lập tenant + 2 lớp login.
 *
 * Auth: mock TenantRepository (không Mongo). Use-case mock. GCRA + middleware thật.
 */

import { DEFAULT_REDIS_CONNECT_DEADLINE_MS, hashKeyPart } from "@megawin/cache";
import { getRedisClient, RedisRepository } from "@megawin/cache/redis";
import { GuardSubjectType } from "@megawin/guard";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PLAYER_LOGIN_PER_PLAYER_RATE_LIMIT, PLAYER_LOGIN_PER_TENANT_RATE_LIMIT } from "../../src/lib/rate-limit";
import { createTenantHttpEvent, parseBody } from "../helpers/tenant-event";

const playerLoginRun = vi.hoisted(() => vi.fn());
const feedRun = vi.hoisted(() => vi.fn());
const tenantsByKey = vi.hoisted(
  () => new Map<string, { tenantId: string; displayName: string; status: string; apiKey: string }>(),
);

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

vi.mock("@megawin/game-core-application/use-cases", () => ({
  GetEntryFeedUseCase: class {
    run = feedRun;
  },
}));

function registerTenant(tenantId: string) {
  const apiKey = `key-${tenantId}`;
  tenantsByKey.set(apiKey, { tenantId, displayName: tenantId, status: "active", apiKey });
  return tenantId;
}

function loginEvent(tenantId: string, playerExternalId: string) {
  return createTenantHttpEvent({ tenantId, body: { playerExternalId } });
}

function feedEvent(tenantId: string) {
  return createTenantHttpEvent({ tenantId, query: { afterVersion: "1", limit: "10" } });
}

function reportEvent(tenantId: string) {
  return createTenantHttpEvent({ tenantId, query: { from: "2026-01-01", to: "2026-01-31" } });
}

beforeEach(async () => {
  delete process.env.GUARD_RATELIMIT_MODE;
  tenantsByKey.clear();
  playerLoginRun.mockReset();
  feedRun.mockReset();
  playerLoginRun.mockResolvedValue({ accessToken: "t", refreshToken: "r" });
  feedRun.mockResolvedValue({ items: [], hasMore: false });
  const client = await getRedisClient();
  await client.flushDb();
});

describe("p1-03 B0 0a — Redis", () => {
  it("0a Redis container là 8.6.x", async () => {
    const client = await getRedisClient();
    const info = await client.info("server");
    const version = info.match(/redis_version:(\S+)/)?.[1];
    expect(version, info).toMatch(/^8\.6\./);
  });
});

describe("api-tenant rateLimit rollout — Redis", () => {
  // #8
  it("#8 tenant A vượt ngưỡng KHÔNG ảnh hưởng tenant B", async () => {
    registerTenant("ten-a8");
    registerTenant("ten-b8");
    const { handler } = await import("../../src/handlers/get-entry-feed");

    const codesA: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = (await handler(feedEvent("ten-a8") as never, {} as never)) as { statusCode: number };
      codesA.push(res.statusCode);
    }
    expect(codesA.slice(0, 3).every((c) => c === 200)).toBe(true);
    expect(codesA[3]).toBe(429);

    const b = (await handler(feedEvent("ten-b8") as never, {} as never)) as { statusCode: number };
    expect(b.statusCode).toBe(200);
    expect(feedRun).toHaveBeenCalledTimes(4);
  });

  // #9
  it("#9 login: per-player độc lập giữa 2 player cùng tenant", async () => {
    registerTenant("ten-9");
    const { handler } = await import("../../src/handlers/player-login");

    const first = (await handler(loginEvent("ten-9", "playerAAAA") as never, {} as never)) as {
      statusCode: number;
    };
    expect(first.statusCode).toBe(200);

    // Per-player burst 0 / 5s — request thứ 2 cùng player trong 5s bị chặn.
    // Tenant burst 20 nên không chặn trước lớp player.
    const denied = (await handler(loginEvent("ten-9", "playerAAAA") as never, {} as never)) as {
      statusCode: number;
      headers: Record<string, string>;
      body: string;
    };
    expect(denied.statusCode).toBe(429);
    expect(parseBody(denied).error?.code).toBe("TOO_MANY_REQUESTS");
    expect(Number(denied.headers["Retry-After"])).toBeGreaterThanOrEqual(1);

    const other = (await handler(loginEvent("ten-9", "playerBBBB") as never, {} as never)) as {
      statusCode: number;
    };
    expect(other.statusCode).toBe(200);
    expect(playerLoginRun).toHaveBeenCalledTimes(2);
  });

  // #10
  it("#10 vượt per-tenant chặn cả tenant đó; tenant khác không ảnh hưởng", async () => {
    registerTenant("ten-a10");
    registerTenant("ten-b10");
    const { handler } = await import("../../src/handlers/player-login");

    // Burst 20 → 21 login liền (player khác nhau để không dính lớp 5s) rồi mới 429.
    const allowedCount = PLAYER_LOGIN_PER_TENANT_RATE_LIMIT.burst + 1;
    const codes: number[] = [];
    for (let i = 0; i < allowedCount + 1; i++) {
      const res = (await handler(loginEvent("ten-a10", `plyr${String(i).padStart(4, "0")}`) as never, {} as never)) as {
        statusCode: number;
      };
      codes.push(res.statusCode);
    }
    expect(codes.slice(0, allowedCount).every((c) => c === 200)).toBe(true);
    expect(codes[allowedCount]).toBe(429);
    expect(playerLoginRun).toHaveBeenCalledTimes(allowedCount);

    const other = (await handler(loginEvent("ten-b10", "playerAAAA") as never, {} as never)) as {
      statusCode: number;
    };
    expect(other.statusCode).toBe(200);
    expect(playerLoginRun).toHaveBeenCalledTimes(allowedCount + 1);
  });

  // #11
  it("#11 3 endpoint quota riêng — vượt login không làm feed 429", async () => {
    registerTenant("ten-11");
    const { handler: login } = await import("../../src/handlers/player-login");
    const { handler: feed } = await import("../../src/handlers/get-entry-feed");

    expect(
      ((await login(loginEvent("ten-11", "playerAAAA") as never, {} as never)) as { statusCode: number }).statusCode,
    ).toBe(200);
    // Cùng player trong 5s → 429 lớp per-player; không trừ quota feed.
    expect(
      ((await login(loginEvent("ten-11", "playerAAAA") as never, {} as never)) as { statusCode: number }).statusCode,
    ).toBe(429);

    const feedRes = (await feed(feedEvent("ten-11") as never, {} as never)) as { statusCode: number };
    expect(feedRes.statusCode).toBe(200);
    expect(feedRun).toHaveBeenCalledTimes(1);
  });

  // #12
  it("#12 dưới ngưỡng → 200 suốt cả 3 endpoint", async () => {
    registerTenant("ten-12");
    const { handler: login } = await import("../../src/handlers/player-login");
    const { handler: feed } = await import("../../src/handlers/get-entry-feed");
    const { handler: reports } = await import("../../src/handlers/get-reports");

    expect(
      ((await login(loginEvent("ten-12", "playerAAAA") as never, {} as never)) as { statusCode: number }).statusCode,
    ).toBe(200);
    for (let i = 0; i < 3; i++) {
      expect(((await feed(feedEvent("ten-12") as never, {} as never)) as { statusCode: number }).statusCode).toBe(200);
    }
    // revenue 20/60 burst mặc định 0 — 1 request dưới ngưỡng; không bắn liền 2 lần.
    expect(((await reports(reportEvent("ten-12") as never, {} as never)) as { statusCode: number }).statusCode).toBe(
      200,
    );
  });

  // #13
  it("#13 Redis lệnh lỗi → cả 3 endpoint vẫn 200 (fail-open)", async () => {
    registerTenant("ten-13");
    const evalSha = vi.spyOn(RedisRepository.prototype, "evalSha").mockRejectedValue(new Error("ECONNREFUSED"));
    const evalCmd = vi.spyOn(RedisRepository.prototype, "eval").mockRejectedValue(new Error("ECONNREFUSED"));

    const { handler: login } = await import("../../src/handlers/player-login");
    const { handler: feed } = await import("../../src/handlers/get-entry-feed");
    const { handler: reports } = await import("../../src/handlers/get-reports");

    const started = Date.now();
    expect(
      ((await login(loginEvent("ten-13", "playerAAAA") as never, {} as never)) as { statusCode: number }).statusCode,
    ).toBe(200);
    expect(((await feed(feedEvent("ten-13") as never, {} as never)) as { statusCode: number }).statusCode).toBe(200);
    expect(((await reports(reportEvent("ten-13") as never, {} as never)) as { statusCode: number }).statusCode).toBe(
      200,
    );
    expect(Date.now() - started).toBeLessThan(DEFAULT_REDIS_CONNECT_DEADLINE_MS);
    expect(evalSha).toHaveBeenCalled();
    expect(playerLoginRun).toHaveBeenCalledTimes(1);
    expect(feedRun).toHaveBeenCalledTimes(1);

    evalSha.mockRestore();
    evalCmd.mockRestore();
  });

  it("tenantId không lộ trong key Redis (hashKeyPart)", async () => {
    const tenantId = "partner-visible-id";
    registerTenant(tenantId);
    const { handler } = await import("../../src/handlers/player-login");
    expect(
      ((await handler(loginEvent(tenantId, "playerAAAA") as never, {} as never)) as { statusCode: number }).statusCode,
    ).toBe(200);

    const client = await getRedisClient();
    const keys = await client.keys("guard:*");
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key, key).not.toContain(tenantId);
      expect(key, key).not.toContain("playerAAAA");
    }
    expect(keys.some((k) => k.includes(hashKeyPart(tenantId)))).toBe(true);
    expect(keys.some((k) => k.includes(PLAYER_LOGIN_PER_TENANT_RATE_LIMIT.route))).toBe(true);
    expect(keys.some((k) => k.includes(PLAYER_LOGIN_PER_PLAYER_RATE_LIMIT.route))).toBe(true);
    expect(keys.some((k) => k.includes(GuardSubjectType.Tenant))).toBe(true);
  });
});
