/**
 * p1-02 B2 #10–#15 — Redis 8.6 thật, 1 endpoint tiêu biểu mỗi nhóm.
 *
 * Use-case mock để không ghi vé/Mongo. Rate-limit middleware + GCRA là bản thật.
 * #15: use-case không được gọi khi 429 ≡ không tạo vé.
 */

import { DEFAULT_REDIS_CONNECT_DEADLINE_MS } from "@megawin/cache";
import { getRedisClient, RedisRepository } from "@megawin/cache/redis";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockEvent, parseBody } from "../helpers/mock-event";

const kenoPlaceBetRun = vi.hoisted(() => vi.fn());
const mega645PlaceBetRun = vi.hoisted(() => vi.fn());
const currentDrawRun = vi.hoisted(() => vi.fn());
const listJackpotsRun = vi.hoisted(() => vi.fn());

vi.mock("@megawin/game-keno-application/use-cases/place-bet", () => ({
  PlaceBetUseCase: class {
    run = kenoPlaceBetRun;
  },
}));

vi.mock("@megawin/game-mega645-application/use-cases/place-bet", () => ({
  PlaceBetUseCase: class {
    run = mega645PlaceBetRun;
  },
}));

vi.mock("@megawin/game-keno-application/use-cases/player", () => ({
  GetCurrentDrawPlayerUseCase: class {
    run = currentDrawRun;
  },
}));

vi.mock("../../src/use-cases/game/list-jackpots", () => ({
  ListJackpotsUseCase: class {
    run = listJackpotsRun;
  },
}));

const KENO_BODY = {
  drawIds: ["2026-02-28.001"],
  boards: [{ boardNo: "A", playType: "pick5", numbers: ["01", "15", "42", "66", "80"] }],
};

const MEGA645_BODY = {
  drawIds: ["2026-02-28.001"],
  boards: [
    {
      boardNo: "A",
      playType: "standard",
      selection: { numbers: ["01", "08", "15", "22", "33", "45"] },
    },
  ],
};

function playerEvent(accountId: string, body?: Record<string, unknown>) {
  const event = createMockEvent({
    user: { accountId },
    body,
  });
  return {
    ...event,
    headers: {
      ...event.headers,
      "mw-idempotency-key": `test-idem-${accountId}-${Math.random().toString(36).slice(2)}`,
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

beforeEach(async () => {
  delete process.env.GUARD_RATELIMIT_MODE;
  kenoPlaceBetRun.mockReset();
  mega645PlaceBetRun.mockReset();
  currentDrawRun.mockReset();
  listJackpotsRun.mockReset();
  kenoPlaceBetRun.mockResolvedValue({ ticketId: "ticket-keno-rl" });
  mega645PlaceBetRun.mockResolvedValue({ ticketId: "ticket-mega-rl" });
  currentDrawRun.mockResolvedValue({ currentDraw: { drawId: "2026-02-28.042" } });
  listJackpotsRun.mockResolvedValue({ jackpots: [] });
  const client = await getRedisClient();
  await client.flushDb();
});

describe("p1-02 B0 — Redis", () => {
  it("Redis container là 8.6.x", async () => {
    const client = await getRedisClient();
    const info = await client.info("server");
    const version = info.match(/redis_version:(\S+)/)?.[1];
    expect(version, info).toMatch(/^8\.6\./);
  });
});

describe("api-player rateLimit rollout — Redis", () => {
  // #10 #15
  it(
    "#10 #15 place-bet: request 2 trước 5 giây (kể cả đổi game) → 429 và không gọi use-case",
    { timeout: 20_000 },
    async () => {
      const { handler: keno } = await import("../../src/handlers/keno/place-bet");
      const { handler: mega } = await import("../../src/handlers/mega645/place-bet");
      const accountId = "acc-p102-10";

      const first = (await keno(playerEvent(accountId, KENO_BODY) as never, {} as never)) as {
        statusCode: number;
      };
      expect(first.statusCode).toBe(200);
      expect(kenoPlaceBetRun).toHaveBeenCalledTimes(1);

      const denied = (await mega(playerEvent(accountId, MEGA645_BODY) as never, {} as never)) as {
        statusCode: number;
        headers: Record<string, string>;
        body: string;
      };
      expect(denied.statusCode).toBe(429);
      expect(denied.headers["Retry-After"]).toBeDefined();
      expect(Number(denied.headers["Retry-After"])).toBeGreaterThanOrEqual(1);
      expect(parseBody(denied).error?.code).toBe("TOO_MANY_REQUESTS");
      expect(mega645PlaceBetRun).not.toHaveBeenCalled();
      expect(kenoPlaceBetRun).toHaveBeenCalledTimes(1);

      const seconds = Number(denied.headers["Retry-After"]);
      await sleep(seconds * 1000 + 80);
      const again = (await mega(playerEvent(accountId, MEGA645_BODY) as never, {} as never)) as {
        statusCode: number;
      };
      expect(again.statusCode).toBe(200);
      expect(mega645PlaceBetRun).toHaveBeenCalledTimes(1);
    },
  );

  // #11
  it("#11 dưới ngưỡng → 200 suốt", async () => {
    const { handler } = await import("../../src/handlers/keno/place-bet");
    const response = (await handler(playerEvent("acc-p102-11", KENO_BODY) as never, {} as never)) as {
      statusCode: number;
    };
    expect(response.statusCode).toBe(200);
    expect(kenoPlaceBetRun).toHaveBeenCalledTimes(1);
  });

  // #12
  it("#12 hai account độc lập: A 429, B 200", async () => {
    const { handler } = await import("../../src/handlers/keno/place-bet");
    const firstA = (await handler(playerEvent("acc-p102-12a", KENO_BODY) as never, {} as never)) as {
      statusCode: number;
    };
    const deniedA = (await handler(playerEvent("acc-p102-12a", KENO_BODY) as never, {} as never)) as {
      statusCode: number;
    };
    const allowedB = (await handler(playerEvent("acc-p102-12b", KENO_BODY) as never, {} as never)) as {
      statusCode: number;
    };

    expect(firstA.statusCode).toBe(200);
    expect(deniedA.statusCode).toBe(429);
    expect(allowedB.statusCode).toBe(200);
    expect(kenoPlaceBetRun).toHaveBeenCalledTimes(2);
  });

  // #13 nhóm 2
  it("#13 nhóm 2 list-jackpots vượt ngưỡng → 429", async () => {
    const { handler } = await import("../../src/handlers/game/list-jackpots");
    const event = playerEvent("acc-p102-g2");
    const first = (await handler(event as never, {} as never)) as { statusCode: number };
    const second = (await handler(event as never, {} as never)) as { statusCode: number };
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
    expect(listJackpotsRun).toHaveBeenCalledTimes(1);
  });

  // #13 nhóm 3
  it("#13 nhóm 3 current-draw vượt ngưỡng → 429", async () => {
    const { handler } = await import("../../src/handlers/keno/get-current-draw");
    const event = playerEvent("acc-p102-g3");
    const first = (await handler(event as never, {} as never)) as { statusCode: number };
    const second = (await handler(event as never, {} as never)) as { statusCode: number };
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
    expect(currentDrawRun).toHaveBeenCalledTimes(1);
  });

  // #14
  it("#14 Redis lệnh lỗi → endpoint vẫn 200 (fail-open)", async () => {
    const evalSha = vi.spyOn(RedisRepository.prototype, "evalSha").mockRejectedValue(new Error("ECONNREFUSED"));
    const evalCmd = vi.spyOn(RedisRepository.prototype, "eval").mockRejectedValue(new Error("ECONNREFUSED"));
    const { handler } = await import("../../src/handlers/keno/place-bet");

    const started = Date.now();
    const response = (await handler(playerEvent("acc-p102-14", KENO_BODY) as never, {} as never)) as {
      statusCode: number;
    };
    const elapsed = Date.now() - started;

    expect(evalSha).toHaveBeenCalled();
    expect(response.statusCode).toBe(200);
    expect(kenoPlaceBetRun).toHaveBeenCalledTimes(1);
    expect(elapsed).toBeLessThan(DEFAULT_REDIS_CONNECT_DEADLINE_MS);

    evalSha.mockRestore();
    evalCmd.mockRestore();
  });
});
