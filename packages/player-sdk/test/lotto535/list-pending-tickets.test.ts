import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlayerClient } from "../../src";
import { BASE_URL, createTestClient, mockFetch, TOKENS } from "../helpers";

const TICKET = {
  ticketId: "TKT-L01",
  ticketNo: "L-20260305-001-0001",
  status: "active",
  totalAmount: 30000,
  drawCount: 3,
  settledDraws: 0,
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
};

describe("lotto535.listPendingTickets", () => {
  let client: PlayerClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = createTestClient();
  });

  it("should call GET /games/lotto535/tickets/pending", async () => {
    const responseData = { tickets: [TICKET], nextCursor: null, size: 20 };
    const fetchMock = mockFetch(responseData);
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.lotto535.listPendingTickets();

    expect(result).toEqual(responseData);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/games/lotto535/tickets/pending`);
    expect(init.method).toBe("GET");
  });

  it("should pass size and cursor as query params", async () => {
    const fetchMock = mockFetch({ tickets: [], nextCursor: null, size: 10 });
    vi.stubGlobal("fetch", fetchMock);

    await client.lotto535.listPendingTickets({ size: 10, cursor: "abc123" });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("/games/lotto535/tickets/pending");
    expect(url).toContain("size=10");
    expect(url).toContain("cursor=abc123");
  });

  it("should include Bearer token in request", async () => {
    const fetchMock = mockFetch({ tickets: [], nextCursor: null, size: 20 });
    vi.stubGlobal("fetch", fetchMock);

    await client.lotto535.listPendingTickets();

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["Authorization"]).toBe(`Bearer ${TOKENS.idToken}`);
  });
});
