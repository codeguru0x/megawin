import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlayerClient } from "../../src";
import { BASE_URL, createTestClient, mockFetch, TOKENS } from "../helpers";

const TICKET = {
  ticketId: "TKT-L10",
  ticketNo: "L-20260301-001-0001",
  status: "completed",
  totalAmount: 30000,
  drawCount: 1,
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
  createdAt: "2026-03-01T09:00:00Z",
};

describe("lotto535.listTickets", () => {
  let client: PlayerClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = createTestClient();
  });

  it("should call GET /games/lotto535/tickets without params", async () => {
    const responseData = { tickets: [TICKET], nextCursor: null, size: 20 };
    const fetchMock = mockFetch(responseData);
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.lotto535.listTickets();

    expect(result).toEqual(responseData);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/games/lotto535/tickets`);
    expect(init.method).toBe("GET");
  });

  it("should pass date range and pagination params", async () => {
    const fetchMock = mockFetch({ tickets: [], nextCursor: null, size: 10 });
    vi.stubGlobal("fetch", fetchMock);

    await client.lotto535.listTickets({
      size: 10,
      from: "2026-03-01",
      to: "2026-03-05",
      cursor: "xyz789",
    });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("size=10");
    expect(url).toContain("from=2026-03-01");
    expect(url).toContain("to=2026-03-05");
    expect(url).toContain("cursor=xyz789");
  });

  it("should return tickets with settlement info", async () => {
    const fetchMock = mockFetch({ tickets: [TICKET], nextCursor: null, size: 20 });
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.lotto535.listTickets();

    expect(result.tickets[0].totalWinAmount).toBe(100000);
    expect(result.tickets[0].status).toBe("completed");
  });

  it("should include Bearer token in request", async () => {
    const fetchMock = mockFetch({ tickets: [], nextCursor: null, size: 20 });
    vi.stubGlobal("fetch", fetchMock);

    await client.lotto535.listTickets();

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["Authorization"]).toBe(`Bearer ${TOKENS.idToken}`);
  });
});
