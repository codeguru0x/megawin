/**
 * Tests: POST /player/power655/bets
 *
 * Validates body schema parsing, use case invocation, and response shape.
 *
 * Power 6/55 differs from Lotto 5/35:
 * - Only mainNumbers (no specialNumbers)
 * - Numbers range "01"-"55"
 * - PlayTypes: Standard (6), Bao7-Bao15, Bao18, QuickPick
 * - Max 5 boards (A-E)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import z from "zod";

import { createMockEvent, parseBody } from "#test/helpers/mock-event";

const mockRun = vi.fn();

vi.mock("@megawin/game-power655-application/use-cases/place-bet", () => ({
  PlaceBetUseCase: class {
    run = mockRun;
  },
}));

vi.mock("@megawin/game-core/entities", () => ({
  TicketChannel: { Pos: "pos", Web: "web", Sdk: "sdk" },
}));

vi.mock("@megawin/game-power655/entities", () => ({
  PlayType: {
    Standard: "standard",
    Bao7: "bao7",
    Bao8: "bao8",
    Bao9: "bao9",
    Bao10: "bao10",
    Bao11: "bao11",
    Bao12: "bao12",
    Bao13: "bao13",
    Bao14: "bao14",
    Bao15: "bao15",
    Bao18: "bao18",
    QuickPick: "quickPick",
  },
}));

vi.mock("@megawin/game-power655/schemas", () => ({
  power655MainNumberSchema: z.string(),
  power655DrawIdSchema: z.string(),
}));

vi.mock("@megawin/game-power655/rules", () => ({
  POWER655_MAX_BOARDS: 100,
}));

const VALID_BODY = {
  drawIds: ["2026-02-28.001"],
  boards: [
    {
      boardNo: "A",
      playType: "standard",
      selection: {
        mainNumbers: ["01", "05", "12", "23", "35", "55"],
      },
    },
  ],
};

describe("POST /player/power655/bets", () => {
  let handler: typeof import("../../../src/handlers/power655/place-bet").handler;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import("../../../src/handlers/power655/place-bet");
    handler = mod.handler;
  });

  /** Validates that mainNumbers are parsed to integers and passed to the use case. */
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
    expect(call.boards[0].selection.mainNumbers).toEqual([1, 5, 12, 23, 35, 55]);
  });

  /** Validates Bao7 requires exactly 7 numbers and they are parsed correctly. */
  it("should accept bao7 with 7 mainNumbers", async () => {
    mockRun.mockResolvedValue({
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: { ticketId: "ticket-002", entries: [] },
      }),
    });

    const event = createMockEvent({
      body: {
        drawIds: ["2026-02-28.001"],
        boards: [
          {
            boardNo: "A",
            playType: "bao7",
            selection: {
              mainNumbers: ["01", "05", "12", "23", "35", "42", "55"],
            },
          },
        ],
      },
    });

    const response = await handler(event as any, {} as any);
    expect(response).toHaveProperty("statusCode", 200);

    const call = mockRun.mock.calls[0]![0];
    expect(call.boards[0].selection.mainNumbers).toHaveLength(7);
  });

  /** Validates QuickPick accepts empty mainNumbers. */
  it("should accept quickPick with empty mainNumbers", async () => {
    mockRun.mockResolvedValue({
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: { ticketId: "ticket-003", entries: [] },
      }),
    });

    const event = createMockEvent({
      body: {
        drawIds: ["2026-02-28.001"],
        boards: [
          {
            boardNo: "A",
            playType: "quickPick",
            selection: { mainNumbers: [] },
          },
        ],
      },
    });

    const response = await handler(event as any, {} as any);
    expect(response).toHaveProperty("statusCode", 200);
  });

  /** Validates duplicate drawIds are rejected. */
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

  /** Validates empty boards array is rejected. */
  it("should reject empty boards", async () => {
    const event = createMockEvent({
      body: { drawIds: ["2026-02-28.001"], boards: [] },
    });

    const response = (await handler(event as any, {} as any)) as any;
    expect(response.statusCode).toBe(400);
  });

  /**
   * Validates that exceeding the hard cap (POWER655_MAX_BOARDS = 100) is rejected.
   * Giới hạn nghiệp vụ thật (maxBoardsPerTicket) được check ở use case, không phải Zod.
   */
  it("should reject when boards exceed hard cap (100)", async () => {
    const boards = Array.from({ length: 101 }, (_, i) => ({
      boardNo: String.fromCharCode(65 + i),
      playType: "standard",
      selection: {
        mainNumbers: ["01", "02", "03", "04", "05", "06"],
      },
    }));

    const event = createMockEvent({
      body: { drawIds: ["2026-02-28.001"], boards },
    });

    const response = (await handler(event as any, {} as any)) as any;
    expect(response.statusCode).toBe(400);
  });

  /** Validates that duplicate mainNumbers within a board are rejected. */
  it("should reject duplicate mainNumbers", async () => {
    const event = createMockEvent({
      body: {
        drawIds: ["2026-02-28.001"],
        boards: [
          {
            boardNo: "A",
            playType: "standard",
            selection: {
              mainNumbers: ["01", "05", "12", "23", "35", "35"],
            },
          },
        ],
      },
    });

    const response = (await handler(event as any, {} as any)) as any;
    expect(response.statusCode).toBe(400);
  });

  /** Validates that standard play type with wrong count (5 instead of 6) is rejected. */
  it("should reject standard with wrong number count", async () => {
    const event = createMockEvent({
      body: {
        drawIds: ["2026-02-28.001"],
        boards: [
          {
            boardNo: "A",
            playType: "standard",
            selection: {
              mainNumbers: ["01", "05", "12", "23", "35"],
            },
          },
        ],
      },
    });

    const response = (await handler(event as any, {} as any)) as any;
    expect(response.statusCode).toBe(400);
  });
});
