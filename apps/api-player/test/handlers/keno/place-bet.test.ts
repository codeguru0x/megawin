/**
 * Tests: POST /player/keno/bets
 *
 * Kiểm tra: body validation, use case invocation, response shape.
 *
 * Contract hiện tại: MỌI loại chơi (cơ bản `pickN` + bổ sung `bigSmall`/`evenOdd`) đều
 * nằm trong `boards[]`, phân biệt bằng `playType` (discriminated union). Field `sideBets[]`
 * đã bị xoá khỏi request body.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import z from "zod";

import { createMockEvent, parseBody } from "#test/helpers/mock-event";

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
  // Mirror đủ KenoPlayType thật — handler build discriminatedUnion trên pick1-pick10
  // + bigSmall + evenOdd; thiếu member nào thì z.literal(undefined) làm schema vô hiệu.
  KenoPlayType: {
    Pick1: "pick1",
    Pick2: "pick2",
    Pick3: "pick3",
    Pick4: "pick4",
    Pick5: "pick5",
    Pick6: "pick6",
    Pick7: "pick7",
    Pick8: "pick8",
    Pick9: "pick9",
    Pick10: "pick10",
    BigSmall: "bigSmall",
    EvenOdd: "evenOdd",
  },
}));

vi.mock("@megawin/game-keno/schemas", () => ({
  kenoNumberSchema: z.string(),
  kenoDrawIdSchema: z.string(),
}));

/**
 * Cách chơi cơ bản (chọn số) — nằm trong `boards[]` với `playType: "pickN"`.
 * `sideBets[]` đã bị XOÁ khỏi body: mọi loại chơi giờ đều là board.
 */
const VALID_BODY_BOARDS = {
  drawIds: ["2026-02-28.001"],
  boards: [{ boardNo: "A", playType: "pick5", numbers: ["01", "15", "42", "66", "80"] }],
};

/** Cách chơi bổ sung (Lớn/Nhỏ) — cũng là board, dùng `bet` thay vì `numbers`. */
const VALID_BODY_SIDE_BETS = {
  drawIds: ["2026-02-28.001"],
  boards: [{ boardNo: "A", playType: "bigSmall", bet: "big" }],
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
        boards: [{ boardNo: "A", playType: "pick5", numbers: ["01", "15", "42", "66", "80"], betCount: 1 }],
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
        boards: [{ boardNo: "A", playType: "bigSmall", bet: "big", betCount: 1 }],
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

  it("should reject when drawIds exceed max (30)", async () => {
    const drawIds = Array.from({ length: 31 }, (_, i) => `2026-02-28.${String(i + 1).padStart(3, "0")}`);

    const event = createMockEvent({
      body: { ...VALID_BODY_BOARDS, drawIds },
    });

    const response = (await handler(event as any, {} as any)) as any;
    expect(response.statusCode).toBe(400);
  });

  it("should reject board numbers exceeding playType pick count", async () => {
    const event = createMockEvent({
      body: {
        drawIds: ["2026-02-28.001"],
        boards: [
          {
            boardNo: "A",
            playType: "pick10",
            numbers: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11"],
          },
        ],
      },
    });

    const response = (await handler(event as any, {} as any)) as any;
    expect(response.statusCode).toBe(400);
  });

  it("should reject board with unknown playType", async () => {
    const event = createMockEvent({
      body: {
        drawIds: ["2026-02-28.001"],
        boards: [{ boardNo: "A", playType: "pick99", numbers: ["01"] }],
      },
    });

    const response = (await handler(event as any, {} as any)) as any;
    expect(response.statusCode).toBe(400);
  });

  it("should reject legacy sideBets-only body (boards is now required)", async () => {
    const event = createMockEvent({
      body: {
        drawIds: ["2026-02-28.001"],
        sideBets: [{ playType: "bigSmall", bet: "big" }],
      },
    });

    const response = (await handler(event as any, {} as any)) as any;
    expect(response.statusCode).toBe(400);
  });
});
