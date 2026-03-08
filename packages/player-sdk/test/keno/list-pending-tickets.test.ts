import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PlayerClient } from "../../src";
import { createTestClient, mockFetch, BASE_URL, TOKENS } from "../helpers";

const TICKET_SUMMARY = {
  id: "65abc001",
  ticketNo: "K-20260225-001-0001",
  status: "pending",
  drawPlan: { drawIds: ["2026-02-25.001"], drawCount: 1 },
  pricing: { unitPrice: 10000, betsPerDraw: 1, amountPerDraw: 10000, totalAmount: 10000 },
  boards: [{ boardNo: "A", playType: "pick5", numbers: ["01", "15", "33", "44", "60"] }],
  sideBets: [],
  progress: { totalDraws: 1, settledDraws: 0 },
  createdAt: "2026-02-25T10:00:00Z",
};

describe("keno.listPendingTickets", () => {
  let client: PlayerClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = createTestClient();
  });

  it("should call GET /games/keno/tickets/pending without params", async () => {
    const responseData = { tickets: [TICKET_SUMMARY], nextCursor: null, size: 20 };
    const fetchMock = mockFetch(responseData);
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.keno.listPendingTickets();

    expect(result).toEqual(responseData);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/games/keno/tickets/pending`);
    expect(init.method).toBe("GET");
  });

  it("should pass size and cursor as query params", async () => {
    const fetchMock = mockFetch({ tickets: [], nextCursor: null, size: 10 });
    vi.stubGlobal("fetch", fetchMock);

    await client.keno.listPendingTickets({ size: 10, cursor: "65abc999" });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("/games/keno/tickets/pending");
    expect(url).toContain("size=10");
    expect(url).toContain("cursor=65abc999");
  });

  it("should handle pagination with nextCursor", async () => {
    const page1Data = {
      tickets: [TICKET_SUMMARY],
      nextCursor: "65abc002",
      size: 1,
    };
    const fetchMock = mockFetch(page1Data);
    vi.stubGlobal("fetch", fetchMock);

    const page1 = await client.keno.listPendingTickets({ size: 1 });
    expect(page1.nextCursor).toBe("65abc002");
    expect(page1.tickets).toHaveLength(1);
  });

  it("should include Bearer token in request", async () => {
    const fetchMock = mockFetch({ tickets: [], nextCursor: null, size: 20 });
    vi.stubGlobal("fetch", fetchMock);

    await client.keno.listPendingTickets();

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["Authorization"]).toBe(`Bearer ${TOKENS.idToken}`);
  });
});
