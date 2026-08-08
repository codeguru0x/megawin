import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlayerClient } from "../../src";
import { BASE_URL, createTestClient, mockFetch, TOKENS } from "../helpers";

describe("lotto535.getCurrentDraw", () => {
  let client: PlayerClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = createTestClient();
  });

  it("should call GET /games/lotto535/draws/current", async () => {
    const responseData = {
      currentDraw: {
        drawId: "2026-03-05.001",
        drawDate: "2026-03-05",
        drawNo: 1,
        drawTime: "2026-03-05T13:00:00Z",
        status: "open",
        salesCloseAt: "2026-03-05T12:50:00Z",
        jackpotAmount: 12_000_000_000,
      },
      activeDraws: [
        {
          drawId: "2026-03-05.001",
          drawDate: "2026-03-05",
          drawNo: 1,
          drawTime: "2026-03-05T13:00:00Z",
          status: "open",
          salesCloseAt: "2026-03-05T12:50:00Z",
          jackpotAmount: 12_000_000_000,
        },
      ],
    };
    const fetchMock = mockFetch(responseData);
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.lotto535.getCurrentDraw();

    expect(result).toEqual(responseData);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/games/lotto535/draws/current`);
    expect(init.method).toBe("GET");
  });

  it("should handle null currentDraw", async () => {
    const responseData = { currentDraw: null, activeDraws: [] };
    const fetchMock = mockFetch(responseData);
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.lotto535.getCurrentDraw();

    expect(result.currentDraw).toBeNull();
    expect(result.activeDraws).toEqual([]);
  });

  it("should include Bearer token in request", async () => {
    const fetchMock = mockFetch({ currentDraw: null, activeDraws: [] });
    vi.stubGlobal("fetch", fetchMock);

    await client.lotto535.getCurrentDraw();

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["Authorization"]).toBe(`Bearer ${TOKENS.idToken}`);
  });
});
