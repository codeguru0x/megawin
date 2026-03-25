import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PlayerClient } from "../../src";
import { createTestClient, mockFetch, BASE_URL, TOKENS } from "../helpers";

const TICKET = {
  id: "65abc010",
  ticketNo: "K-20260220-050-0001",
  status: "settled",
  drawPlan: { drawIds: ["2026-02-20.050"], drawCount: 1 },
  pricing: { unitPrice: 10000, betsPerDraw: 1, amountPerDraw: 10000, totalAmount: 10000 },
  boards: [{ boardNo: "A", playType: "pick5", numbers: ["01", "15", "33", "44", "60"] }],
  progress: { totalDraws: 1, settledDraws: 1 },
  settlement: { totalWinAmount: 50000 },
  createdAt: "2026-02-20T08:00:00Z",
};

describe("keno.listTickets", () => {
  let client: PlayerClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = createTestClient();
  });

  it("should call GET /games/keno/tickets without params", async () => {
    const responseData = { tickets: [TICKET], nextCursor: null, size: 20 };
    const fetchMock = mockFetch(responseData);
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.keno.listTickets();

    expect(result).toEqual(responseData);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/games/keno/tickets`);
    expect(init.method).toBe("GET");
  });

  it("should pass date range query params", async () => {
    const fetchMock = mockFetch({ tickets: [], nextCursor: null, size: 10 });
    vi.stubGlobal("fetch", fetchMock);

    await client.keno.listTickets({
      size: 10,
      from: "2026-02-01",
      to: "2026-02-28",
      cursor: "65abc999",
    });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("size=10");
    expect(url).toContain("from=2026-02-01");
    expect(url).toContain("to=2026-02-28");
    expect(url).toContain("cursor=65abc999");
  });

  it("should return tickets with settlement info", async () => {
    const fetchMock = mockFetch({ tickets: [TICKET], nextCursor: null, size: 20 });
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.keno.listTickets();

    expect(result.tickets[0].settlement).toBeDefined();
    expect(result.tickets[0].settlement!.totalWinAmount).toBe(50000);
  });

  it("should include Bearer token in request", async () => {
    const fetchMock = mockFetch({ tickets: [], nextCursor: null, size: 20 });
    vi.stubGlobal("fetch", fetchMock);

    await client.keno.listTickets();

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["Authorization"]).toBe(`Bearer ${TOKENS.idToken}`);
  });
});
