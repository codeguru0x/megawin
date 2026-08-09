/**
 * Tests: GET /player/power655/draws/current
 *
 * Validates that the handler returns the current draw with dual jackpot info.
 * Power 6/55 returns both jackpot1CurrentAmount and jackpot2CurrentAmount
 * (unlike Lotto 5/35 which has a single jackpotCurrentAmount).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockEvent, parseBody } from "#test/helpers/mock-event";

vi.mock("@megawin/game-power655-application/use-cases/player", () => ({
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
            drawTime: "2026-02-28T11:00:00.000Z",
            status: "salesOpen",
            sales: { closeAt: "2026-02-28T10:45:00.000Z" },
            jackpot1CurrentAmount: 30_000_000_000,
            jackpot2CurrentAmount: 3_000_000_000,
          },
          activeDraws: [],
          jackpot1CurrentAmount: 30_000_000_000,
          jackpot2CurrentAmount: 3_000_000_000,
          lastResult: null,
        },
      }),
    });
  },
}));

describe("GET /player/power655/draws/current", () => {
  let handler: typeof import("../../../src/handlers/power655/get-current-draw").handler;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("../../../src/handlers/power655/get-current-draw");
    handler = mod.handler;
  });

  /** Validates the response contains current draw and dual jackpot amounts. */
  it("should return current draw with dual jackpot info", async () => {
    const event = createMockEvent();
    const response = await handler(event as any, {} as any);
    const body = parseBody(response as any);

    expect(response).toHaveProperty("statusCode", 200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("currentDraw");
    expect(body.data).toHaveProperty("jackpot1CurrentAmount");
    expect(body.data).toHaveProperty("jackpot2CurrentAmount");
  });
});
