import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PlayerClient } from "../../src";
import { createTestClient, mockFetch, BASE_URL, TOKENS } from "../helpers";

describe("keno.getCurrentDraw", () => {
  let client: PlayerClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = createTestClient();
  });

  it("should call GET /games/keno/draws/current", async () => {
    const responseData = {
      currentDraw: {
        drawId: "2026-02-25.100",
        drawDate: "2026-02-25",
        drawNo: 100,
        drawTime: "2026-02-25T13:00:00Z",
        status: "salesOpen",
        sales: { closeAt: "2026-02-25T13:05:00Z" },
      },
      activeDraws: [
        {
          drawId: "2026-02-25.100",
          drawDate: "2026-02-25",
          drawNo: 100,
          drawTime: "2026-02-25T13:00:00Z",
          status: "salesOpen",
          sales: { closeAt: "2026-02-25T13:05:00Z" },
        },
      ],
      lastResult: {
        drawId: "2026-02-25.099",
        drawDate: "2026-02-25",
        drawNo: 99,
        winningNumbers: [
          3, 7, 12, 18, 22, 25, 31, 36, 40, 44, 49, 53, 57, 61, 65, 69, 72, 75, 78, 80,
        ],
        publishedAt: "2026-02-25T12:55:00Z",
      },
    };
    const fetchMock = mockFetch(responseData);
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.keno.getCurrentDraw();

    expect(result).toEqual(responseData);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/games/keno/draws/current`);
    expect(init.method).toBe("GET");
  });

  it("should handle null currentDraw and lastResult", async () => {
    const responseData = {
      currentDraw: null,
      activeDraws: [],
      lastResult: null,
    };
    const fetchMock = mockFetch(responseData);
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.keno.getCurrentDraw();

    expect(result.currentDraw).toBeNull();
    expect(result.activeDraws).toEqual([]);
    expect(result.lastResult).toBeNull();
  });

  it("should include Bearer token in request", async () => {
    const fetchMock = mockFetch({ currentDraw: null, activeDraws: [], lastResult: null });
    vi.stubGlobal("fetch", fetchMock);

    await client.keno.getCurrentDraw();

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["Authorization"]).toBe(`Bearer ${TOKENS.idToken}`);
  });
});
