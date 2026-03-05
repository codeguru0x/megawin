import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PlayerClient } from "../../src";
import { createTestClient, mockFetch, BASE_URL, TOKENS } from "../helpers";

describe("lotto535.getJackpot", () => {
  let client: PlayerClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = createTestClient();
  });

  it("should call GET /games/lotto535/jackpot", async () => {
    const responseData = { jackpotAmount: 15_000_000_000 };
    const fetchMock = mockFetch(responseData);
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.lotto535.getJackpot();

    expect(result).toEqual(responseData);
    expect(result.jackpotAmount).toBe(15_000_000_000);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/games/lotto535/jackpot`);
    expect(init.method).toBe("GET");
  });

  it("should include Bearer token in request", async () => {
    const fetchMock = mockFetch({ jackpotAmount: 0 });
    vi.stubGlobal("fetch", fetchMock);

    await client.lotto535.getJackpot();

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["Authorization"]).toBe(`Bearer ${TOKENS.idToken}`);
  });
});
