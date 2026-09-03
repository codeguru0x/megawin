/**
 * Tests: GET /results (api-resultfeed)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockEvent, parseBody } from "../../helpers/mock-event";

const API_KEY = "test-api-key";

vi.mock("@megawin/resultfeed-application/use-cases/results", () => ({
  PullResultsUseCase: class {
    run = vi.fn().mockResolvedValue({
      items: [
        {
          gameKey: "keno",
          drawPeriod: "2026-02-28.042",
          drawDateSource: "2026-02-28",
          numbers: ["01", "02"],
          payoutHash: "hash-abc",
          publishedAt: "2026-02-28T06:50:00.000Z",
          verifiedByHuman: false,
          sourceCount: 2,
        },
      ],
    });
  },
}));

describe("GET /results", () => {
  let handler: typeof import("../../../src/handlers/results/get-results").handler;

  beforeEach(async () => {
    process.env.RESULTFEED_API_KEY = API_KEY;
    vi.resetModules();
    const mod = await import("../../../src/handlers/results/get-results");
    handler = mod.handler;
  });

  it("should return 401 when API key is missing", async () => {
    const event = createMockEvent({ queryStringParameters: { gameKey: "keno", drawPeriod: "2026-02-28.042" } });
    const response = await handler(event as any, {} as any);
    const body = parseBody(response as any);

    expect(response).toHaveProperty("statusCode", 401);
    expect(body.success).toBe(false);
  });

  it("should return 401 when API key is wrong", async () => {
    const event = createMockEvent({
      headers: { "x-resultfeed-api-key": "wrong-key" },
      queryStringParameters: { gameKey: "keno", drawPeriod: "2026-02-28.042" },
    });
    const response = await handler(event as any, {} as any);

    expect(response).toHaveProperty("statusCode", 401);
  });

  it("should return items with valid API key + single lookup", async () => {
    const event = createMockEvent({
      headers: { "x-resultfeed-api-key": API_KEY },
      queryStringParameters: { gameKey: "keno", drawPeriod: "2026-02-28.042" },
    });
    const response = await handler(event as any, {} as any);
    const body = parseBody<{ items: unknown[] }>(response as any);

    expect(response).toHaveProperty("statusCode", 200);
    expect(body.success).toBe(true);
    expect(body.data?.items).toHaveLength(1);
  });

  it("should return 400 when gameKey is invalid", async () => {
    const event = createMockEvent({
      headers: { "x-resultfeed-api-key": API_KEY },
      queryStringParameters: { gameKey: "not-a-real-game" },
    });
    const response = await handler(event as any, {} as any);

    expect(response).toHaveProperty("statusCode", 400);
  });
});
