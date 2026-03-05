import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PlayerClient } from "../../src";
import type { Lotto535TicketPurchaseInput } from "../../src/lotto535";
import { createTestClient, mockFetch, mockFetchError, BASE_URL, TOKENS } from "../helpers";

describe("lotto535.placeBet", () => {
  let client: PlayerClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = createTestClient();
  });

  it("should call POST /games/lotto535/bets with correct body", async () => {
    const responseData = {
      ticketId: "TKT-L01",
      ticketNo: "L-20260225-001",
      totalAmount: 30000,
    };
    const fetchMock = mockFetch(responseData);
    vi.stubGlobal("fetch", fetchMock);

    const input: Lotto535TicketPurchaseInput = {
      drawId: "2026-02-25-001",
      drawCount: 1,
      boards: [
        {
          boardNo: "A",
          playType: "standard",
          selection: {
            mainNumbers: ["01", "08", "15", "22", "35"],
            specialNumbers: ["07"],
          },
        },
      ],
    };

    const result = await client.lotto535.placeBet(input);

    expect(result).toEqual(responseData);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/games/lotto535/bets`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual(input);
  });

  it("should include Bearer token in request", async () => {
    const fetchMock = mockFetch({ ticketId: "TKT-L01", ticketNo: "L-001", totalAmount: 30000 });
    vi.stubGlobal("fetch", fetchMock);

    await client.lotto535.placeBet({
      drawId: "2026-02-25-001",
      drawCount: 1,
      boards: [
        {
          boardNo: "A",
          playType: "standard",
          selection: { mainNumbers: ["01", "08", "15", "22", "35"], specialNumbers: ["07"] },
        },
      ],
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["Authorization"]).toBe(`Bearer ${TOKENS.idToken}`);
  });

  it("should throw ApiClientError on DRAW_CLOSED", async () => {
    vi.stubGlobal("fetch", mockFetchError("DRAW_CLOSED", "Kỳ quay đã đóng bán"));

    await expect(
      client.lotto535.placeBet({
        drawId: "2026-02-25-001",
        drawCount: 1,
        boards: [
          {
            boardNo: "A",
            playType: "standard",
            selection: { mainNumbers: ["01", "08", "15", "22", "35"], specialNumbers: ["07"] },
          },
        ],
      }),
    ).rejects.toThrow("Kỳ quay đã đóng bán");
  });

  it("should handle multiple boards", async () => {
    const fetchMock = mockFetch({ ticketId: "TKT-L02", ticketNo: "L-002", totalAmount: 186000 });
    vi.stubGlobal("fetch", fetchMock);

    const input: Lotto535TicketPurchaseInput = {
      drawId: "2026-02-25-001",
      drawCount: 3,
      boards: [
        {
          boardNo: "A",
          playType: "mainCover",
          selection: {
            mainNumbers: ["01", "05", "10", "15", "20", "25", "30", "35"],
            specialNumbers: ["07"],
          },
        },
        {
          boardNo: "B",
          playType: "standard",
          selection: {
            mainNumbers: ["02", "11", "19", "27", "33"],
            specialNumbers: ["12"],
          },
        },
      ],
    };

    const result = await client.lotto535.placeBet(input);
    expect(result.totalAmount).toBe(186000);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.boards).toHaveLength(2);
    expect(body.boards[0].playType).toBe("mainCover");
    expect(body.boards[1].playType).toBe("standard");
  });
});
