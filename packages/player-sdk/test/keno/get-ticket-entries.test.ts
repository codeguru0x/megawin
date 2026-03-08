import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PlayerClient } from "../../src";
import { createTestClient, mockFetch, mockFetchError, BASE_URL, TOKENS } from "../helpers";

const TICKET_WITH_ENTRIES = {
  ticket: {
    id: "65abc001",
    ticketNo: "K-20260225-001-0001",
    status: "active",
    drawPlan: { drawIds: ["2026-02-25.001", "2026-02-25.002"], drawCount: 2 },
    pricing: { unitPrice: 10000, betsPerDraw: 1, amountPerDraw: 10000, totalAmount: 20000 },
    boards: [{ boardNo: "A", playType: "pick5", numbers: ["01", "15", "33", "44", "60"] }],
    sideBets: [],
    progress: { totalDraws: 2, settledDraws: 1 },
    settlement: { totalWinAmount: 50000 },
    createdAt: "2026-02-25T10:00:00Z",
  },
  entries: [
    {
      id: "entry001",
      drawId: "2026-02-25.001",
      drawDate: "2026-02-25",
      status: "settled",
      amount: 10000,
      betCount: 1,
      entrySummary: {
        ticketNo: "K-20260225-001-0001",
        boards: [{ boardNo: "A", playType: "pick5", numbers: ["01", "15", "33", "44", "60"] }],
        sideBets: [],
      },
      result: {
        winningNumbers: [
          1, 7, 15, 22, 33, 38, 44, 49, 55, 60, 63, 67, 70, 72, 74, 76, 78, 79, 80, 3,
        ],
        publishedAt: "2026-02-25T13:05:00Z",
        bigCount: 12,
        smallCount: 8,
        evenCount: 10,
        oddCount: 10,
      },
      outcome: "win",
      payout: {
        winAmount: 50000,
        payoutAmount: 50000,
        boardPayouts: [
          { boardNo: "A", playType: "pick5", matchCount: 3, pickCount: 5, winAmount: 50000 },
        ],
        sideBetPayouts: [],
      },
    },
    {
      id: "entry002",
      drawId: "2026-02-25.002",
      drawDate: "2026-02-25",
      status: "pending",
      amount: 10000,
      betCount: 1,
      entrySummary: {
        ticketNo: "K-20260225-001-0001",
        boards: [{ boardNo: "A", playType: "pick5", numbers: ["01", "15", "33", "44", "60"] }],
        sideBets: [],
      },
    },
  ],
};

describe("keno.getTicketEntries", () => {
  let client: PlayerClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = createTestClient();
  });

  it("should call GET /games/keno/tickets/{ticketId}/entries", async () => {
    const fetchMock = mockFetch(TICKET_WITH_ENTRIES);
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.keno.getTicketEntries("65abc001");

    expect(result).toEqual(TICKET_WITH_ENTRIES);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/games/keno/tickets/65abc001/entries`);
    expect(init.method).toBe("GET");
  });

  it("should return ticket with entries containing result and payout", async () => {
    const fetchMock = mockFetch(TICKET_WITH_ENTRIES);
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.keno.getTicketEntries("65abc001");

    expect(result.ticket.ticketNo).toBe("K-20260225-001-0001");
    expect(result.entries).toHaveLength(2);

    const settled = result.entries[0];
    expect(settled.status).toBe("settled");
    expect(settled.result).toBeDefined();
    expect(settled.result!.winningNumbers).toHaveLength(20);
    expect(settled.payout).toBeDefined();
    expect(settled.payout!.winAmount).toBe(50000);
    expect(settled.payout!.boardPayouts[0].matchCount).toBe(3);

    const pending = result.entries[1];
    expect(pending.status).toBe("pending");
    expect(pending.result).toBeUndefined();
    expect(pending.payout).toBeUndefined();
  });

  it("should throw ApiClientError on NOT_FOUND", async () => {
    vi.stubGlobal("fetch", mockFetchError("NOT_FOUND", "Ticket not found", 404));

    await expect(client.keno.getTicketEntries("nonexistent")).rejects.toThrow("Ticket not found");
  });

  it("should include Bearer token in request", async () => {
    const fetchMock = mockFetch(TICKET_WITH_ENTRIES);
    vi.stubGlobal("fetch", fetchMock);

    await client.keno.getTicketEntries("65abc001");

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["Authorization"]).toBe(`Bearer ${TOKENS.idToken}`);
  });
});
