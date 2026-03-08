import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PlayerClient } from "../../src";
import type { KenoTicketPurchaseInput } from "../../src/keno";
import { createTestClient, mockFetch, mockFetchError, BASE_URL, TOKENS } from "../helpers";

describe("keno.placeBet", () => {
  let client: PlayerClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = createTestClient();
  });

  it("should call POST /games/keno/bets with correct body", async () => {
    const responseData = {
      ticketId: "65abc123",
      ticketNo: "K-20260225-001-0001",
      status: "active",
      drawPlan: { drawIds: ["2026-02-25.001"], drawCount: 1 },
      pricing: { unitPrice: 10000, betsPerDraw: 1, amountPerDraw: 10000, totalAmount: 10000 },
      boardCount: 1,
      sideBetCount: 0,
      entryCount: 1,
    };
    const fetchMock = mockFetch(responseData);
    vi.stubGlobal("fetch", fetchMock);

    const input: KenoTicketPurchaseInput = {
      drawIds: ["2026-02-25.001"],
      boards: [{ boardNo: "A", numbers: ["01", "15", "33", "44", "60"] }],
    };

    const result = await client.keno.placeBet(input);

    expect(result).toEqual(responseData);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/games/keno/bets`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual(input);
  });

  it("should include Bearer token in request", async () => {
    const fetchMock = mockFetch({
      ticketId: "65abc",
      ticketNo: "K-001",
      status: "active",
      drawPlan: { drawIds: ["2026-02-25.001"], drawCount: 1 },
      pricing: { unitPrice: 10000, betsPerDraw: 1, amountPerDraw: 10000, totalAmount: 10000 },
      boardCount: 1,
      sideBetCount: 0,
      entryCount: 1,
    });
    vi.stubGlobal("fetch", fetchMock);

    await client.keno.placeBet({
      drawIds: ["2026-02-25.001"],
      boards: [{ boardNo: "A", numbers: ["01"] }],
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["Authorization"]).toBe(`Bearer ${TOKENS.idToken}`);
  });

  it("should throw ApiClientError on INSUFFICIENT_BALANCE", async () => {
    vi.stubGlobal("fetch", mockFetchError("INSUFFICIENT_BALANCE", "Không đủ số dư"));

    await expect(
      client.keno.placeBet({
        drawIds: ["2026-02-25.001"],
        boards: [{ boardNo: "A", numbers: ["01"] }],
      }),
    ).rejects.toThrow("Không đủ số dư");
  });

  it("should handle multiple drawIds and side bets", async () => {
    const responseData = {
      ticketId: "65abc456",
      ticketNo: "K-20260225-001-0002",
      status: "active",
      drawPlan: {
        drawIds: ["2026-02-25.001", "2026-02-25.002", "2026-02-25.003"],
        drawCount: 3,
      },
      pricing: { unitPrice: 10000, betsPerDraw: 3, amountPerDraw: 30000, totalAmount: 90000 },
      boardCount: 1,
      sideBetCount: 1,
      entryCount: 3,
    };
    const fetchMock = mockFetch(responseData);
    vi.stubGlobal("fetch", fetchMock);

    const input: KenoTicketPurchaseInput = {
      drawIds: ["2026-02-25.001", "2026-02-25.002", "2026-02-25.003"],
      boards: [{ boardNo: "A", numbers: ["01", "15", "33"] }],
      sideBets: [{ playType: "bigSmall", bet: "big" }],
    };

    const result = await client.keno.placeBet(input);
    expect(result.entryCount).toBe(3);
    expect(result.sideBetCount).toBe(1);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.drawIds).toHaveLength(3);
    expect(body.sideBets).toEqual([{ playType: "bigSmall", bet: "big" }]);
  });
});
