import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlayerClient } from "../../src";
import { BASE_URL, createTestClient, mockFetch, mockFetchError, TOKENS } from "../helpers";

const TICKET_WITH_ENTRIES = {
  ticket: {
    ticketId: "TKT-L01",
    ticketNo: "L-20260305-001-0001",
    status: "active",
    totalAmount: 60000,
    drawCount: 2,
    settledDraws: 1,
    totalWinAmount: 100000,
    boards: [
      {
        boardNo: "A",
        playType: "standard",
        mainNumbers: [1, 8, 15, 22, 35],
        specialNumbers: [7],
        expandedLines: 1,
      },
    ],
    createdAt: "2026-03-05T10:00:00Z",
  },
  entries: [
    {
      drawId: "2026-03-05.001",
      drawDate: "2026-03-05",
      status: "settled",
      amount: 30000,
      result: {
        winningMain: [1, 8, 15, 22, 35],
        winningSpecial: 7,
        publishedAt: "2026-03-05T13:05:00Z",
      },
      payout: {
        winAmount: 100000,
        tiers: [{ tier: "jackpot", label: "Jackpot", hitCount: 1, amount: 100000, isJackpot: true }],
      },
    },
    {
      drawId: "2026-03-05.002",
      drawDate: "2026-03-05",
      status: "pending",
      amount: 30000,
    },
  ],
};

describe("lotto535.getTicketEntries", () => {
  let client: PlayerClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = createTestClient();
  });

  it("should call GET /games/lotto535/tickets/{ticketId}/entries", async () => {
    const fetchMock = mockFetch(TICKET_WITH_ENTRIES);
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.lotto535.getTicketEntries("TKT-L01");

    expect(result).toEqual(TICKET_WITH_ENTRIES);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/games/lotto535/tickets/TKT-L01/entries`);
    expect(init.method).toBe("GET");
  });

  it("should return entries with result and payout", async () => {
    const fetchMock = mockFetch(TICKET_WITH_ENTRIES);
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.lotto535.getTicketEntries("TKT-L01");

    expect(result.entries).toHaveLength(2);

    const settled = result.entries[0];
    expect(settled.status).toBe("settled");
    expect(settled.result).toBeDefined();
    expect(settled.result!.winningMain).toEqual([1, 8, 15, 22, 35]);
    expect(settled.payout).toBeDefined();
    expect(settled.payout!.winAmount).toBe(100000);

    const pending = result.entries[1];
    expect(pending.status).toBe("pending");
    expect(pending.result).toBeUndefined();
    expect(pending.payout).toBeUndefined();
  });

  it("should throw ApiClientError on NOT_FOUND", async () => {
    vi.stubGlobal("fetch", mockFetchError("NOT_FOUND", "Ticket not found", 404));

    await expect(client.lotto535.getTicketEntries("nonexistent")).rejects.toThrow("Ticket not found");
  });

  it("should include Bearer token in request", async () => {
    const fetchMock = mockFetch(TICKET_WITH_ENTRIES);
    vi.stubGlobal("fetch", fetchMock);

    await client.lotto535.getTicketEntries("TKT-L01");

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["Authorization"]).toBe(`Bearer ${TOKENS.idToken}`);
  });
});
