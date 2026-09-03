/**
 * ResultFeed Client — mode "http".
 *
 * Gọi qua đúng contract HTTP thật tới `apps/api-resultfeed` (`GET /results`), xác thực bằng
 * header `x-resultfeed-api-key`. Dùng khi 2 hệ thống tách cluster/deploy độc lập
 * (`RESULTFEED_CLIENT_MODE="http"`) — xem factory `resultfeed-client.ts`.
 *
 * `apps/api-resultfeed` bọc response qua `successEnvelopeMiddleware` (`@megawin/app-core`) —
 * cùng shape `{ success, data }` với `ApiResponse` chuẩn — `createHttpClient` tự unwrap `data`.
 */

import type { VietlottResultClient, VietlottResultRecord } from "@megawin/game-core/types";
import { createHttpClient } from "@megawin/http-client";

import { env } from "@/env";

interface ResultFeedApiItem {
  gameKey: string;
  drawPeriod: string;
  drawDateSource: string;
  numbers: string[];
  payoutHash: string;
  publishedAt: string;
  verifiedByHuman: boolean;
  sourceCount: number;
}

interface ResultFeedApiResponse {
  items: ResultFeedApiItem[];
}

function createClient() {
  return createHttpClient({
    baseUrl: env.RESULTFEED_API_URL ?? "",
    headers: {
      "x-resultfeed-api-key": env.RESULTFEED_API_KEY ?? "",
    },
    retry: 2,
  });
}

export const resultFeedClientHttp: VietlottResultClient = {
  async getResult(lookup): Promise<VietlottResultRecord | null> {
    const http = createClient();
    const response = await http.get<ResultFeedApiResponse>("/results", {
      params: { gameKey: lookup.gameKey, drawPeriod: lookup.drawPeriod },
    });

    const item = response.items[0];
    if (!item) {
      return null;
    }

    return {
      numbers: item.numbers,
      drawDateSource: item.drawDateSource,
      publishedAt: item.publishedAt,
      verifiedByHuman: item.verifiedByHuman,
      sourceCount: item.sourceCount,
    };
  },
};
