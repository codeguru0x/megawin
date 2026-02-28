/**
 * Tests: GET /player/keno/draws/current
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockEvent, parseBody } from "#test/helpers/mock-event";

vi.mock("@megawin/game-keno-application/use-cases/player", () => ({
  GetCurrentDrawPlayerUseCase: vi.fn().mockImplementation(() => ({
    run: vi.fn().mockResolvedValue({
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: {
          currentDraw: {
            drawId: "2026-02-28.042",
            drawDate: "2026-02-28",
            drawNo: 42,
            drawTime: "2026-02-28T06:50:00.000Z",
            status: "salesOpen",
            sales: { closeAt: "2026-02-28T06:48:00.000Z" },
          },
          activeDraws: [],
          lastResult: null,
        },
      }),
    }),
  })),
}));

describe("GET /player/keno/draws/current", () => {
  let handler: typeof import("../../../src/handlers/keno/get-current-draw").handler;

  beforeEach(async () => {
    const mod = await import("../../../src/handlers/keno/get-current-draw");
    handler = mod.handler;
  });

  it("should return current draw without jackpot info", async () => {
    const event = createMockEvent();
    const response = await handler(event as any, {} as any);
    const body = parseBody(response as any);

    expect(response).toHaveProperty("statusCode", 200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("currentDraw");
    expect(body.data).not.toHaveProperty("jackpotCurrentAmount");
  });
});
