import { beforeEach, describe, expect, it, vi } from "vitest";

import type { JackpotSummaryListResponse, PlayerClient } from "../../src";
import { JackpotGameProduct } from "../../src";
import { BASE_URL, createTestClient, mockFetch, TOKENS } from "../helpers";

/** Response gộp mẫu — 3 game jackpot, mỗi game 1 shape `details` riêng. */
const RESPONSE: JackpotSummaryListResponse = {
  jackpots: [
    {
      gameProduct: JackpotGameProduct.Lotto535,
      displayName: "Lotto 5/35",
      primaryAmount: 1_200_000_000,
      cycleNo: 7,
      drawCount: 12,
      startDrawId: "2026-02-20.001",
      details: {
        seedAmount: 500_000_000,
        peakAmount: 1_200_000_000,
        totalContribution: 700_000_000,
        progress: {
          splitThreshold: 2_000_000_000,
          percentage: 60,
          reachedSplitThreshold: false,
        },
      },
    },
    {
      gameProduct: JackpotGameProduct.Mega645,
      displayName: "Mega 6/45",
      primaryAmount: 30_000_000_000,
      cycleNo: 3,
      drawCount: 40,
      startDrawId: "2026-01-05.001",
      details: {
        seedAmount: 12_000_000_000,
        peakAmount: 30_000_000_000,
        totalContribution: 18_000_000_000,
      },
    },
    {
      gameProduct: JackpotGameProduct.Power655,
      displayName: "Power 6/55",
      primaryAmount: 80_000_000_000,
      cycleNo: 5,
      drawCount: 25,
      startDrawId: "2026-01-28.001",
      details: {
        jackpot2CurrentAmount: 4_500_000_000,
        jackpot1SeedAmount: 30_000_000_000,
        jackpot2SeedAmount: 3_000_000_000,
        jackpot1OverflowThreshold: 300_000_000_000,
        jackpot2ResetCount: 1,
      },
    },
  ],
};

describe("game.jackpots.list", () => {
  let client: PlayerClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = createTestClient();
  });

  it("should call GET /games/jackpots", async () => {
    const fetchMock = mockFetch(RESPONSE);
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.game.jackpots.list();

    expect(result).toEqual(RESPONSE);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/games/jackpots`);
    expect(init.method).toBe("GET");
  });

  it("should include Bearer token in request", async () => {
    const fetchMock = mockFetch({ jackpots: [] });
    vi.stubGlobal("fetch", fetchMock);

    await client.game.jackpots.list();

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["Authorization"]).toBe(`Bearer ${TOKENS.idToken}`);
  });

  /**
   * Kiểm tra discriminated union narrow được `details` theo `gameProduct` —
   * đây là hợp đồng type quan trọng nhất của endpoint gộp. Nếu union bị phá
   * (VD `details` tách khỏi discriminator), block dưới sẽ không compile.
   */
  it("should narrow details by gameProduct", async () => {
    const fetchMock = mockFetch(RESPONSE);
    vi.stubGlobal("fetch", fetchMock);

    const { jackpots } = await client.game.jackpots.list();
    const seen: string[] = [];

    for (const jp of jackpots) {
      switch (jp.gameProduct) {
        case JackpotGameProduct.Lotto535:
          expect(jp.details.progress.reachedSplitThreshold).toBe(false);
          expect(jp.details.progress.percentage).toBe(60);
          seen.push(jp.gameProduct);
          break;
        case JackpotGameProduct.Mega645:
          expect(jp.details.seedAmount).toBe(12_000_000_000);
          seen.push(jp.gameProduct);
          break;
        case JackpotGameProduct.Power655:
          expect(jp.details.jackpot2CurrentAmount).toBe(4_500_000_000);
          expect(jp.details.jackpot2ResetCount).toBe(1);
          seen.push(jp.gameProduct);
          break;
      }
    }

    expect(seen).toEqual(["lotto535", "mega645", "power655"]);
  });

  /** Game chưa có active cycle bị bỏ qua — mảng rỗng là response hợp lệ, không phải lỗi. */
  it("should accept empty jackpots array", async () => {
    const fetchMock = mockFetch({ jackpots: [] });
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.game.jackpots.list();

    expect(result.jackpots).toEqual([]);
  });
});
