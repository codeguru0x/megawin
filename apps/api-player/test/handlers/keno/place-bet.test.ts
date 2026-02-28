/**
 * Tests: POST /player/keno/bets
 *
 * Kiểm tra: body validation, use case invocation, response shape.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockEvent, parseBody } from "#test/helpers/mock-event";
import z from "zod";

const mockRun = vi.fn();

vi.mock("@megawin/game-keno-application/use-cases/place-bet", () => ({
  PlaceBetUseCase: class {
    run = mockRun;
  },
}));

vi.mock("@megawin/game-core/entities", () => ({
  TicketChannel: { Pos: "pos", Web: "web", Sdk: "sdk" },
}));

vi.mock("@megawin/game-keno/entities", () => ({
  KenoBigSmallBet: { Big: "big", BigSmallDraw: "bigSmallDraw", Small: "small" },
  KenoEvenOddBet: {
    Even: "even",
    Even1112: "even1112",
    EvenOddDraw: "evenOddDraw",
    Odd1112: "odd1112",
    Odd: "odd",
  },
  KenoPlayType: { BigSmall: "bigSmall", EvenOdd: "evenOdd" },
}));

vi.mock("@megawin/game-keno/schemas", () => ({
  kenoNumberSchema: z.string(),
  kenoDrawIdSchema: z.string(),
}));

const VALID_BODY_BOARDS = {
  drawIds: ["2026-02-28.001"],
  boards: [{ boardNo: "A", numbers: ["01", "15", "42", "66", "80"] }],
  sideBets: [],
};

const VALID_BODY_SIDE_BETS = {
  drawIds: ["2026-02-28.001"],
  boards: [],
  sideBets: [{ playType: "bigSmall", bet: "big" }],
};

describe("POST /player/keno/bets", () => {
  let handler: typeof import("../../../src/handlers/keno/place-bet").handler;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import("../../../src/handlers/keno/place-bet");
    handler = mod.handler;
  });

  it("should call use case with board bets", async () => {
    mockRun.mockResolvedValue({
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: { ticketId: "ticket-keno-001", entries: [] },
      }),
    });

    const event = createMockEvent({ body: VALID_BODY_BOARDS });
    const response = await handler(event as any, {} as any);
    const body = parseBody(response as any);

    expect(response).toHaveProperty("statusCode", 200);
    expect(body.success).toBe(true);
    expect(mockRun).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-001",
        accountId: "acc-001",
        username: "player001",
        channel: "sdk",
        drawIds: ["2026-02-28.001"],
        boards: [{ boardNo: "A", numbers: ["01", "15", "42", "66", "80"] }],
        sideBets: [],
      }),
    );
  });

  it("should call use case with side bets", async () => {
    mockRun.mockResolvedValue({
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: { ticketId: "ticket-keno-002", entries: [] },
      }),
    });

    const event = createMockEvent({ body: VALID_BODY_SIDE_BETS });
    const response = await handler(event as any, {} as any);
    const body = parseBody(response as any);

    expect(response).toHaveProperty("statusCode", 200);
    expect(body.success).toBe(true);
    expect(mockRun).toHaveBeenCalledWith(
      expect.objectContaining({
        sideBets: [{ playType: "bigSmall", bet: "big" }],
      }),
    );
  });

  it("should reject duplicate drawIds", async () => {
    const event = createMockEvent({
      body: {
        ...VALID_BODY_BOARDS,
        drawIds: ["2026-02-28.001", "2026-02-28.001"],
      },
    });

    const response = (await handler(event as any, {} as any)) as any;
    expect(response.statusCode).toBe(400);
  });

  it("should reject when drawIds exceed max (20)", async () => {
    const drawIds = Array.from({ length: 21 }, (_, i) =>
      `2026-02-28.${String(i + 1).padStart(3, "0")}`,
    );

    const event = createMockEvent({
      body: { ...VALID_BODY_BOARDS, drawIds },
    });

    const response = (await handler(event as any, {} as any)) as any;
    expect(response.statusCode).toBe(400);
  });

  it("should reject board numbers exceeding max (10)", async () => {
    const event = createMockEvent({
      body: {
        drawIds: ["2026-02-28.001"],
        boards: [
          {
            boardNo: "A",
            numbers: [
              "01", "02", "03", "04", "05",
              "06", "07", "08", "09", "10", "11",
            ],
          },
        ],
        sideBets: [],
      },
    });

    const response = (await handler(event as any, {} as any)) as any;
    expect(response.statusCode).toBe(400);
  });
});
