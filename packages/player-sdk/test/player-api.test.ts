import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlayerClient } from "../src";
import { BASE_URL, createTestClient, mockFetch } from "./helpers";

/**
 * `client.player` hiện chỉ expose `getBalance`.
 *
 * `getBetHistory` / `getGameResult` KHÔNG có trong SDK — endpoint tương ứng chưa tồn tại.
 * Khi endpoint thật lên, thêm method vào `PlayerApi` rồi mới viết test ở đây.
 */
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
