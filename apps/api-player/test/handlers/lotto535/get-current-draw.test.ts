/**
 * Tests: GET /player/lotto535/draws/current
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockEvent, parseBody } from "#test/helpers/mock-event";

vi.mock("@megawin/game-lotto535-application/use-cases/player", () => ({
  GetCurrentDrawPlayerUseCase: class {
    run = vi.fn().mockResolvedValue({
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: {
          currentDraw: {
            drawId: "2026-02-28.001",
            drawDate: "2026-02-28",
            drawNo: 1,
            drawTime: "2026-02-28T06:00:00.000Z",
            status: "salesOpen",
            sales: { closeAt: "2026-02-28T05:50:00.000Z" },
            jackpotCurrentAmount: 12_000_000_000,
          },
          activeDraws: [],
          jackpotCurrentAmount: 12_000_000_000,
          lastResult: null,
        },
      }),
    });
  },
}));

describe("GET /player/lotto535/draws/current", () => {
  let handler: typeof import("../../../src/handlers/lotto535/get-current-draw").handler;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("../../../src/handlers/lotto535/get-current-draw");
    handler = mod.handler;
  });

  it("should return current draw with jackpot info", async () => {
    const event = createMockEvent();
    const response = await handler(event as any, {} as any);
    const body = parseBody(response as any);

    expect(response).toHaveProperty("statusCode", 200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("currentDraw");
    expect(body.data).toHaveProperty("jackpotCurrentAmount");
  });
});
