/**
 * Tests: POST /player/lotto535/bets
 *
 * Kiểm tra: body validation, use case invocation, response shape.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockEvent, parseBody } from "#test/helpers/mock-event";
import z from "zod";

const mockRun = vi.fn();

vi.mock("@megawin/game-lotto535-application/use-cases/place-bet", () => ({
  PlaceBetUseCase: class {
    run = mockRun;
  },
}));

vi.mock("@megawin/game-core/entities", () => ({
  TicketChannel: { Pos: "pos", Web: "web", Sdk: "sdk" },
}));

vi.mock("@megawin/game-lotto535/entities", () => ({
  PlayType: {
    Standard: "standard",
    MainCover: "mainCover",
    MainCover4: "mainCover4",
    SpecialCover: "specialCover",
    QuickPick: "quickPick",
  },
}));

vi.mock("@megawin/game-lotto535/schemas", () => ({
  lotto535MainNumberSchema: z.string(),
  lotto535SpecialNumberSchema: z.string(),
  lotto535DrawIdSchema: z.string(),
  VALID_BOARD_NOS: ["A", "B", "C", "D", "E"],
}));

const VALID_BODY = {
  drawIds: ["2026-02-28.001"],
  boards: [
    {
      boardNo: "A",
      playType: "standard",
      selection: {
        mainNumbers: ["01", "05", "12", "23", "35"],
        specialNumbers: ["03"],
      },
    },
  ],
};

describe("POST /player/lotto535/bets", () => {
  let handler: typeof import("../../../src/handlers/lotto535/place-bet").handler;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import("../../../src/handlers/lotto535/place-bet");
    handler = mod.handler;
  });

  it("should call use case with parsed numbers and correct params", async () => {
    mockRun.mockResolvedValue({
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: { ticketId: "ticket-001", entries: [] },
      }),
    });

    const event = createMockEvent({ body: VALID_BODY });
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
      }),
    );

    const call = mockRun.mock.calls[0]![0];
    expect(call.boards[0].selection.mainNumbers).toEqual([1, 5, 12, 23, 35]);
    expect(call.boards[0].selection.specialNumbers).toEqual([3]);
  });

  it("should reject duplicate drawIds", async () => {
    const event = createMockEvent({
      body: {
        ...VALID_BODY,
        drawIds: ["2026-02-28.001", "2026-02-28.001"],
      },
    });

    const response = (await handler(event as any, {} as any)) as any;
    expect(response.statusCode).toBe(400);
  });

  it("should reject empty boards", async () => {
    const event = createMockEvent({
      body: { drawIds: ["2026-02-28.001"], boards: [] },
    });

    const response = (await handler(event as any, {} as any)) as any;
    expect(response.statusCode).toBe(400);
  });

  it("should reject when boards exceed max (5)", async () => {
    const boards = Array.from({ length: 6 }, (_, i) => ({
      boardNo: String.fromCharCode(65 + i),
      playType: "standard",
      selection: {
        mainNumbers: ["01", "02", "03", "04", "05"],
        specialNumbers: ["01"],
      },
    }));

    const event = createMockEvent({
      body: { drawIds: ["2026-02-28.001"], boards },
    });

    const response = (await handler(event as any, {} as any)) as any;
    expect(response.statusCode).toBe(400);
  });
});
