import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlayerClient } from "../../src";
import { BASE_URL, createTestClient, mockFetch, mockFetchError, TOKENS } from "../helpers";

describe("lotto535.getEntryLines", () => {
  let client: PlayerClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = createTestClient();
  });

  it("should call GET /games/lotto535/entries/{entryId}/lines", async () => {
    const responseData = {
      entryId: "ENT-001",
      lines: [
        { mainNumbers: [1, 5, 10, 15, 20], specialNumber: 7 },
        { mainNumbers: [1, 5, 10, 15, 25], specialNumber: 7 },
        { mainNumbers: [1, 5, 10, 20, 25], specialNumber: 7 },
      ],
    };
    const fetchMock = mockFetch(responseData);
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.lotto535.getEntryLines("ENT-001");

    expect(result).toEqual(responseData);
    expect(result.lines).toHaveLength(3);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/games/lotto535/entries/ENT-001/lines`);
    expect(init.method).toBe("GET");
  });

  it("should return single line for standard play type", async () => {
    const responseData = {
      entryId: "ENT-002",
      lines: [{ mainNumbers: [1, 8, 15, 22, 35], specialNumber: 7 }],
    };
    const fetchMock = mockFetch(responseData);
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.lotto535.getEntryLines("ENT-002");

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].mainNumbers).toEqual([1, 8, 15, 22, 35]);
    expect(result.lines[0].specialNumber).toBe(7);
  });

  it("should throw ApiClientError on NOT_FOUND", async () => {
    vi.stubGlobal("fetch", mockFetchError("NOT_FOUND", "Entry not found", 404));

    await expect(client.lotto535.getEntryLines("nonexistent")).rejects.toThrow("Entry not found");
  });

  it("should include Bearer token in request", async () => {
    const fetchMock = mockFetch({ entryId: "ENT-001", lines: [] });
    vi.stubGlobal("fetch", fetchMock);

    await client.lotto535.getEntryLines("ENT-001");

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["Authorization"]).toBe(`Bearer ${TOKENS.idToken}`);
  });
});
