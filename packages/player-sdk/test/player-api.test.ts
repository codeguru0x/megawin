import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlayerClient } from "../src";
import { BASE_URL, createTestClient, mockFetch } from "./helpers";

describe("player.getBalance", () => {
  let client: PlayerClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = createTestClient();
  });

  it("should call GET /me/balance", async () => {
    const balanceData = {
      playerId: "player-001",
      tenantId: "tenant-001",
      balance: 500000,
      currency: "VND",
    };
    const fetchMock = mockFetch(balanceData);
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.player.getBalance();

    expect(result).toEqual(balanceData);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/me/balance`);
    expect(init.method).toBe("GET");
  });
});

describe("player.getBetHistory", () => {
  let client: PlayerClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = createTestClient();
  });

  it("should call GET /player/bets without params", async () => {
    const historyData = { bets: [], total: 0, page: 1, pageSize: 20 };
    const fetchMock = mockFetch(historyData);
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.player.getBetHistory();

    expect(result).toEqual(historyData);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/player/bets`);
  });

  it("should include query params", async () => {
    const fetchMock = mockFetch({ bets: [], total: 0, page: 2, pageSize: 10 });
    vi.stubGlobal("fetch", fetchMock);

    await client.player.getBetHistory({ gameId: "keno", page: 2, pageSize: 10 });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("/player/bets");
    expect(url).toContain("gameId=keno");
    expect(url).toContain("page=2");
    expect(url).toContain("pageSize=10");
  });
});

describe("player.getGameResult", () => {
  let client: PlayerClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = createTestClient();
  });

  it("should call GET /player/games/{gameId}/results/{roundId}", async () => {
    const resultData = {
      gameId: "keno",
      roundId: "2026-02-25.001",
      status: "completed",
      result: { winningNumbers: [1, 5, 10] },
      publishedAt: "2026-02-25T13:05:00Z",
    };
    const fetchMock = mockFetch(resultData);
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.player.getGameResult("keno", "2026-02-25.001");

    expect(result).toEqual(resultData);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/player/games/keno/results/2026-02-25.001`);
  });
});
