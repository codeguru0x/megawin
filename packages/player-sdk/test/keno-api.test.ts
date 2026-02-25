import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPlayerClient, type PlayerClient } from "../src";
import type { KenoTicketPurchaseInput } from "../src/keno";

function mockFetch(data: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve({ success: true, data }),
  });
}

function mockFetchError(code: string, message: string, status = 400) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    statusText: "Error",
    headers: new Headers({ "content-type": "application/json" }),
    json: () =>
      Promise.resolve({
        success: false,
        error: { code, message },
      }),
  });
}

const TOKENS = {
  accessToken: "test-token",
  refreshToken: "test-refresh",
  expiresAt: Date.now() + 3600_000,
};

describe("keno.placeBet", () => {
  let client: PlayerClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = createPlayerClient({
      baseUrl: "https://api.test.com",
      tokens: TOKENS,
    });
  });

  it("should call POST /player/keno/bets with correct body", async () => {
    const responseData = {
      ticketId: "TKT-001",
      ticketNo: "K-20260225-001",
      totalAmount: 10000,
    };
    const fetchMock = mockFetch(responseData);
    vi.stubGlobal("fetch", fetchMock);

    const input: KenoTicketPurchaseInput = {
      startDrawId: "2026-02-25-001",
      drawCount: 1,
      boards: [{ boardNo: "A", numbers: ["01", "15", "33", "44", "60"] }],
    };

    const result = await client.keno.placeBet(input);

    expect(result).toEqual(responseData);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.test.com/player/keno/bets");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual(input);
  });

  it("should include Bearer token in request", async () => {
    const fetchMock = mockFetch({ ticketId: "TKT-001", ticketNo: "K-001", totalAmount: 10000 });
    vi.stubGlobal("fetch", fetchMock);

    await client.keno.placeBet({
      startDrawId: "2026-02-25-001",
      drawCount: 1,
      boards: [{ boardNo: "A", numbers: ["01"] }],
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["Authorization"]).toBe("Bearer test-token");
  });

  it("should throw ApiClientError on INSUFFICIENT_BALANCE", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchError("INSUFFICIENT_BALANCE", "Không đủ số dư"),
    );

    await expect(
      client.keno.placeBet({
        startDrawId: "2026-02-25-001",
        drawCount: 1,
        boards: [{ boardNo: "A", numbers: ["01"] }],
      }),
    ).rejects.toThrow("Không đủ số dư");
  });

  it("should handle side bets", async () => {
    const responseData = {
      ticketId: "TKT-002",
      ticketNo: "K-20260225-002",
      totalAmount: 20000,
    };
    const fetchMock = mockFetch(responseData);
    vi.stubGlobal("fetch", fetchMock);

    const input: KenoTicketPurchaseInput = {
      startDrawId: "2026-02-25-001",
      drawCount: 1,
      boards: [{ boardNo: "A", numbers: ["01", "15", "33"] }],
      sideBets: [{ playType: "bigSmall", bet: "big" }],
    };

    const result = await client.keno.placeBet(input);
    expect(result).toEqual(responseData);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.sideBets).toEqual([{ playType: "bigSmall", bet: "big" }]);
  });
});
